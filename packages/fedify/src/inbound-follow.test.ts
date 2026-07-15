import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { Accept, Follow, Undo } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { eq, ne } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as InboundFollow from './inbound-follow';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const localActorUri = new URL(`/ap/actor/${localProfileId}`, publicOrigin);
const remoteActorUri = new URL('https://remote.example/users/alice');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let handleInboundFollow: typeof InboundFollow.handleInboundFollow;
let handleInboundUndo: typeof InboundFollow.handleInboundUndo;
let localInstanceId: string;

describe('inbound Follow and Undo', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundFollow, handleInboundUndo } = await import('./inbound-follow'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await pg.end();
  });

  test('routes personal Follow, sends Accept, and removes by actor pair despite a different Follow id', async () => {
    const fixture = await createFixture();
    const sendActivity = mock.fn(async () => undefined);
    const context = createContext({ recipient: localProfileId, sendActivity });
    const follow = new Follow({
      actor: remoteActorUri,
      id: new URL('https://remote.example/activities/follow-1'),
      object: localActorUri,
      published: Temporal.Instant.from('2026-07-15T00:00:00Z'),
    });

    await handleInboundFollow(context, follow);

    const relation = await db.select().from(ProfileFollows).limit(1).then(firstOrThrow);
    assert.equal(relation.followerProfileId, fixture.remoteProfile.id);
    assert.equal(relation.followeeProfileId, fixture.localProfile.id);
    assert.equal(sendActivity.mock.calls.length, 1);
    const accept = (sendActivity.mock.calls as unknown as Array<{ arguments: unknown[] }>)[0]
      ?.arguments[2];
    assert.ok(accept instanceof Accept);
    assert.equal((await accept.getObject())?.id?.href, follow.id?.href);

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({
          actor: remoteActorUri,
          id: new URL('https://remote.example/activities/different-follow-id'),
          object: localActorUri,
        }),
        published: Temporal.Instant.from('2026-07-15T00:00:01Z'),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    const [local, remote] = await Promise.all([
      db.select().from(Profiles).where(eq(Profiles.id, fixture.localProfile.id)).then(firstOrThrow),
      db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, fixture.remoteProfile.id))
        .then(firstOrThrow),
    ]);
    assert.equal(local.followersCount, 0);
    assert.equal(remote.followingCount, 0);
  });

  test('preserves the projection for embedded Undo actor or object mismatch', async () => {
    await createFixture();
    const context = createContext({ recipient: localProfileId });
    await handleInboundFollow(
      context,
      new Follow({ actor: remoteActorUri, object: localActorUri }),
    );

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({
          actor: new URL('https://remote.example/users/mallory'),
          object: localActorUri,
        }),
      }),
    );
    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({
          actor: remoteActorUri,
          object: new URL(`${publicOrigin}/ap/actor/019f6f67-2222-7777-8888-123456789abc`),
        }),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
  });

  test('routes shared-inbox approval-required Follow without Accept', async () => {
    await createFixture({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED });
    const sendActivity = mock.fn(async () => undefined);
    const context = createContext({ recipient: null, sendActivity });

    await handleInboundFollow(
      context,
      new Follow({ actor: remoteActorUri, object: localActorUri }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 1);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.equal(sendActivity.mock.calls.length, 0);
  });

  test('validates the personal recipient before any unknown-actor network lookup', async () => {
    await createFixture();
    const lookupObject = mock.fn(async () => null);
    const lookupWebFinger = mock.fn(async () => null);
    const context = createContext({
      lookupObject,
      lookupWebFinger,
      recipient: 'different-profile',
    });

    await handleInboundFollow(
      context,
      new Follow({
        actor: new URL('https://unknown.example/users/mallory'),
        object: localActorUri,
      }),
    );

    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(lookupWebFinger.mock.calls.length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });

  test('ignores expected actor validation failures but propagates lookup outages', async () => {
    await createFixture();
    const unknownActorUri = new URL('https://unknown.example/users/mallory');
    const follow = new Follow({ actor: unknownActorUri, object: localActorUri });

    await handleInboundFollow(
      createContext({
        lookupWebFinger: mock.fn(async () => null),
        recipient: localProfileId,
      }),
      follow,
    );

    await assert.rejects(
      handleInboundFollow(
        createContext({
          lookupWebFinger: mock.fn(async () => {
            throw new Error('WebFinger unavailable');
          }),
          recipient: localProfileId,
        }),
        follow,
      ),
      /WebFinger unavailable/,
    );
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });

  test('keeps the projection when Accept delivery fails and ignores IRI-only Undo', async () => {
    const fixture = await createFixture();
    const context = createContext({
      recipient: localProfileId,
      sendActivity: mock.fn(async () => {
        throw new Error('delivery failed');
      }),
    });
    const follow = new Follow({ actor: remoteActorUri, object: localActorUri });
    await handleInboundFollow(context, follow);
    await db
      .update(Instances)
      .set({ state: InstanceState.UNRESPONSIVE })
      .where(eq(Instances.id, fixture.remoteInstance.id));

    await handleInboundUndo(
      context,
      new Undo({ actor: remoteActorUri, object: new URL('https://remote.example/follow/1') }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(
      await db
        .select({ state: Instances.state })
        .from(Instances)
        .where(eq(Instances.id, fixture.remoteInstance.id))
        .then(firstOrThrow),
      { state: InstanceState.ACTIVE },
    );
  });

  test('reactivates a stored UNRESPONSIVE actor from Undo without network lookup', async () => {
    const fixture = await createFixture({ remoteInstanceState: InstanceState.UNRESPONSIVE });
    const lookupObject = mock.fn(async () => null);
    const lookupWebFinger = mock.fn(async () => null);
    const context = createContext({ lookupObject, lookupWebFinger, recipient: localProfileId });
    await db.insert(ProfileFollows).values({
      followeeProfileId: fixture.localProfile.id,
      followerProfileId: fixture.remoteProfile.id,
    });
    await db.update(Profiles).set({ followersCount: 1 }).where(eq(Profiles.id, localProfileId));
    await db
      .update(Profiles)
      .set({ followingCount: 1 })
      .where(eq(Profiles.id, fixture.remoteProfile.id));

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({ actor: remoteActorUri, object: localActorUri }),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    const remoteInstance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, fixture.remoteInstance.id))
      .then(firstOrThrow);
    assert.equal(remoteInstance.state, InstanceState.ACTIVE);
    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(lookupWebFinger.mock.calls.length, 0);
  });

  test('ignores Undo from a stored SUSPENDED actor without network lookup', async () => {
    const fixture = await createFixture({ remoteInstanceState: InstanceState.SUSPENDED });
    const lookupObject = mock.fn(async () => null);
    const lookupWebFinger = mock.fn(async () => null);
    const context = createContext({ lookupObject, lookupWebFinger, recipient: localProfileId });
    await db.insert(ProfileFollows).values({
      followeeProfileId: fixture.localProfile.id,
      followerProfileId: fixture.remoteProfile.id,
    });

    await handleInboundUndo(
      context,
      new Undo({
        actor: remoteActorUri,
        object: new Follow({ actor: remoteActorUri, object: localActorUri }),
      }),
    );

    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(lookupWebFinger.mock.calls.length, 0);
  });
});

const createFixture = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  remoteInstanceState = InstanceState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  remoteInstanceState?: InstanceState;
} = {}) => {
  const remoteInstance = await db
    .insert(Instances)
    .values({
      domain: 'remote.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: remoteInstanceState,
    })
    .returning()
    .then(firstOrThrow);
  const localProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Local',
      followPolicy,
      handle: 'local',
      id: localProfileId,
      instanceId: localInstanceId,
      normalizedHandle: 'local',
    })
    .returning()
    .then(firstOrThrow);
  const remoteProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Alice',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: 'alice',
      instanceId: remoteInstance.id,
      normalizedHandle: 'alice',
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(ActivityPubActors).values([
    {
      profileId: localProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: localActorUri.href,
    },
    {
      inboxUri: 'https://remote.example/users/alice/inbox',
      profileId: remoteProfile.id,
      sharedInboxUri: 'https://remote.example/inbox',
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    },
  ]);

  return { localProfile, remoteInstance, remoteProfile };
};

const createContext = ({
  lookupObject = mock.fn(async () => null),
  lookupWebFinger = mock.fn(async () => null),
  recipient,
  sendActivity = mock.fn(async () => undefined),
}: {
  lookupObject?: ReturnType<typeof mock.fn>;
  lookupWebFinger?: ReturnType<typeof mock.fn>;
  recipient: string | null;
  sendActivity?: ReturnType<typeof mock.fn>;
}): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    lookupObject,
    lookupWebFinger,
    recipient,
    sendActivity,
  }) as unknown as InboxContext<void>;
