import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Move, Person } from '@fedify/vocab';
import { and, eq, inArray } from 'drizzle-orm';
import { startTestTemporalRuntime } from '../../core/temporal/test-runtime';
import type { InboxContext } from '@fedify/fedify';

const publicOrigin = process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for inbound Move integration tests.');
}

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.NODE_ENV = 'test';

// This integration file starts the real Temporal runtime and Worker before importing
// the client, so workflow.start remains the production call under test.
await startTestTemporalRuntime();

const {
  AccountProfiles,
  Accounts,
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  ProfileFollows,
  ProfileFollowRequests,
  Profiles,
  pg,
} = await import('@kosmo/core/db');
const {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} = await import('@kosmo/core/enums');
const { prepareProfileMigration } = await import('@kosmo/core/services');
const { profileMigrationWorkflowId } = await import('@kosmo/core/temporal/profile-migration');
const { temporalClient } = await import('@kosmo/core/temporal/client');
const { federation } = await import('@kosmo/fedify');
const { handleInboundMove } = await import('./inbound-move');
const { seedDatabase } = await import('@kosmo/core/db/seed');

const createdAccountIds: string[] = [];
const createdInstanceIds: string[] = [];
const createdProfileIds: string[] = [];

before(async () => {
  await seedDatabase({ publicOrigin });
});

after(async () => {
  if (createdProfileIds.length > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, createdProfileIds));
  }
  if (createdAccountIds.length > 0) {
    await db.delete(Accounts).where(inArray(Accounts.id, createdAccountIds));
  }
  if (createdInstanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, createdInstanceIds));
  }
  await pg.end();
});

test('준비한 source alias에서 inbound Move와 실제 Workflow가 Local follower state를 수렴시킨다', async () => {
  const source = await createRemoteSource();
  const target = await createLocalTarget();
  const follower = await createLocalFollower();

  const preparation = await prepareProfileMigration({
    accountId: target.accountId,
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  });
  assert.equal(preparation.id, target.profile.id);

  const targetActorUri = new URL(`/ap/actor/${target.profile.id}`, publicOrigin);
  const actorResponse = await federation.fetch(
    new Request(targetActorUri, {
      headers: { accept: 'application/activity+json' },
    }),
    { contextData: undefined },
  );
  if (actorResponse.status !== 200) {
    throw new Error(
      `Local Actor dispatcher returned ${actorResponse.status}: ${await actorResponse.text()}`,
    );
  }
  const targetActor = await Person.fromJsonLd(await actorResponse.json());
  const aliases = targetActor.aliasIds.map((alias) => alias.href);
  assert.deepEqual(aliases, [source.actorUri]);
  const canonicalSourceUri = aliases[0];
  assert.ok(canonicalSourceUri);

  const ownerAccount = await db
    .select({ featureFlags: Accounts.featureFlags })
    .from(Accounts)
    .where(eq(Accounts.id, target.accountId))
    .limit(1)
    .then(firstOrThrow);
  assert.deepEqual(ownerAccount.featureFlags, []);

  const sourceFollow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: follower.id, followeeProfileId: source.profile.id })
    .returning()
    .then(firstOrThrow);

  await handleInboundMove(
    createInboundContext(),
    new Move({
      actor: new URL(canonicalSourceUri),
      object: new URL(canonicalSourceUri),
      target: targetActorUri,
    }),
  );

  await temporalClient.workflow
    .getHandle(
      profileMigrationWorkflowId({
        sourceProfileId: source.profile.id,
        targetProfileId: target.profile.id,
      }),
    )
    .result();

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, sourceFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.id),
          eq(ProfileFollows.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, follower.id),
          eq(ProfileFollowRequests.followeeProfileId, target.profile.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
});

const createInboundContext = (): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    lookupObject: async () => null,
    recipient: null,
  }) as unknown as InboxContext<void>;

const createRemoteSource = async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const domain = `${suffix}.remote.example`;
  const instance = await db
    .insert(Instances)
    .values({ domain, kind: InstanceKind.ACTIVITYPUB, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  createdInstanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Moved source',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: 'source',
      instanceId: instance.id,
      normalizedHandle: 'source',
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  createdProfileIds.push(profile.id);

  const actorUri = `https://${domain}/users/source`;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${actorUri}/inbox`,
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });

  return { actorUri, profile };
};

const createLocalTarget = async () => {
  const localInstance = await db
    .select()
    .from(Instances)
    .where(eq(Instances.canonicalOrigin, new URL(publicOrigin).origin))
    .limit(1)
    .then(firstOrThrow);
  const handle = `target-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Migration target',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstance.id,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  createdProfileIds.push(profile.id);

  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Migration owner',
      oidcSubject: crypto.randomUUID(),
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  createdAccountIds.push(account.id);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });

  return { accountId: account.id, profile };
};

const createLocalFollower = async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.follower.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  createdInstanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Local follower',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `follower-${suffix.slice(0, 12)}`,
      instanceId: instance.id,
      normalizedHandle: `follower-${suffix.slice(0, 12)}`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  createdProfileIds.push(profile.id);
  return profile;
};
