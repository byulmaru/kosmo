import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { Block, Like } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as InboundProfileBlock from './inbound-profile-block';

const publicOrigin = 'http://127.0.0.1:4173';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let Profiles: typeof CoreDb.Profiles;
let handleInboundBlock: typeof InboundProfileBlock.handleInboundBlock;
let handleInboundUndoBlock: typeof InboundProfileBlock.handleInboundUndoBlock;
let localInstanceId: string;
const testProfileIds = new Set<string>();
const testInstanceIds = new Set<string>();

before(async () => {
  process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
  process.env.PUBLIC_ORIGIN = publicOrigin;
  ({ ActivityPubActors, db, firstOrThrow, Instances, pg, ProfileBlocks, Profiles } =
    await import('@kosmo/core/db'));
  const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
  const { localInstance } = await seedDatabase({ publicOrigin });
  localInstanceId = localInstance.id;
  ({ handleInboundBlock, handleInboundUndoBlock } = await import('./inbound-profile-block'));
});

afterEach(async () => {
  if (testProfileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...testProfileIds]));
  }
  if (testInstanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...testInstanceIds]));
  }
  testProfileIds.clear();
  testInstanceIds.clear();
});

after(async () => {
  await pg.end();
});

test('inbound Block and embedded Undo use the current pair without Activity IDs', async () => {
  const fixture = await createFixture();
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({ actor: fixture.remoteActorUri, object: fixture.localActorUri }),
  );
  const [firstRelation] = await db
    .select()
    .from(ProfileBlocks)
    .where(eq(ProfileBlocks.ownerProfileId, fixture.remoteProfile.id));
  assert.ok(firstRelation);

  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({
      actor: fixture.remoteActorUri,
      id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/alternate-block`),
      object: fixture.localActorUri,
    }),
  );
  assert.deepEqual(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.ownerProfileId, fixture.remoteProfile.id)),
    [firstRelation],
  );

  const undo = {
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: new Block({ actor: fixture.remoteActorUri, object: fixture.localActorUri }),
    objectUri: null,
    remoteActorProfileId: fixture.remoteProfile.id,
  };
  assert.equal(await handleInboundUndoBlock(undo), true);
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.ownerProfileId, fixture.remoteProfile.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(await handleInboundUndoBlock(undo), true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
});

test('inbound Block requires a verified remote actor and the active local recipient', async () => {
  const fixture = await createFixture();
  const anotherRecipient = crypto.randomUUID();
  const block = new Block({ actor: fixture.remoteActorUri, object: fixture.localActorUri });

  await handleInboundBlock(createContext(anotherRecipient), block);
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({ actor: fixture.remoteActorUri, object: fixture.remoteActorUri }),
  );
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({
      actor: new URL('https://unverified.example/users/malice'),
      object: fixture.localActorUri,
    }),
  );
  await db
    .update(Profiles)
    .set({ state: ProfileState.SUSPENDED })
    .where(eq(Profiles.id, fixture.localProfile.id));
  await handleInboundBlock(createContext(fixture.localProfile.id), block);
  assert.equal((await db.select().from(ProfileBlocks)).length, 0);

  await db
    .update(Profiles)
    .set({ state: ProfileState.ACTIVE })
    .where(eq(Profiles.id, fixture.localProfile.id));
  await handleInboundBlock(createContext(fixture.localProfile.id), block);
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
  for (const embedded of [
    new Block({
      actor: new URL(`https://${fixture.remoteActorUri.hostname}/users/another-actor`),
      object: fixture.localActorUri,
    }),
    new Block({
      actor: fixture.remoteActorUri,
      object: new URL(`/ap/actor/${crypto.randomUUID()}`, publicOrigin),
    }),
  ]) {
    assert.equal(
      await handleInboundUndoBlock({
        context: createContext(fixture.localProfile.id),
        actorUri: fixture.remoteActorUri,
        embedded,
        objectUri: null,
        remoteActorProfileId: fixture.remoteProfile.id,
      }),
      true,
    );
  }
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
});

test('Undo without an embedded Block does not remove the current relation', async () => {
  const fixture = await createFixture();
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({ actor: fixture.remoteActorUri, object: fixture.localActorUri }),
  );
  const base = {
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    objectUri: null,
    remoteActorProfileId: fixture.remoteProfile.id,
  };
  assert.equal(
    await handleInboundUndoBlock({ ...base, embedded: { id: fixture.remoteActorUri } }),
    false,
  );
  assert.equal(
    await handleInboundUndoBlock({
      ...base,
      embedded: new Like({ actor: fixture.remoteActorUri, object: fixture.localActorUri }),
    }),
    false,
  );
  assert.equal(await handleInboundUndoBlock({ ...base, embedded: null }), false);
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
});

const createFixture = async () => {
  const remoteInstance = await db
    .insert(Instances)
    .values({
      domain: `remote-${crypto.randomUUID()}.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  testInstanceIds.add(remoteInstance.id);
  const localHandle = `local-${crypto.randomUUID()}`;
  const remoteHandle = `alice-${crypto.randomUUID()}`;
  const localProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Local',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: localHandle,
      instanceId: localInstanceId,
      normalizedHandle: localHandle,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.add(localProfile.id);
  const remoteProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Alice',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: remoteHandle,
      instanceId: remoteInstance.id,
      normalizedHandle: remoteHandle,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.add(remoteProfile.id);
  const localActorUri = new URL(`/ap/actor/${localProfile.id}`, publicOrigin);
  const remoteActorUri = new URL(`https://${remoteInstance.domain}/users/${remoteHandle}`);

  await db.insert(ActivityPubActors).values([
    {
      profileId: localProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: localActorUri.href,
    },
    {
      inboxUri: `${remoteActorUri.href}/inbox`,
      lastFetchedAt: Temporal.Now.instant(),
      profileId: remoteProfile.id,
      sharedInboxUri: `https://${remoteInstance.domain}/inbox`,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    },
  ]);

  return { localActorUri, localProfile, remoteActorUri, remoteProfile };
};

const createContext = (recipient: string): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    lookupObject: async () => null,
    lookupWebFinger: async () => null,
    recipient,
  }) as unknown as InboxContext<void>;
