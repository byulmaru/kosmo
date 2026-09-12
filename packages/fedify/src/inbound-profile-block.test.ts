import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { Block } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { eq, inArray, sql } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreServices from '@kosmo/core/services';
import type * as InboundProfileBlock from './inbound-profile-block';

const publicOrigin = 'http://127.0.0.1:4173';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileBlockActivities: typeof CoreDb.ProfileBlockActivities;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let Profiles: typeof CoreDb.Profiles;
let handleInboundBlock: typeof InboundProfileBlock.handleInboundBlock;
let handleInboundUndoBlock: typeof InboundProfileBlock.handleInboundUndoBlock;
let executeProfileBlockTransitionInTransaction: typeof CoreServices.executeProfileBlockTransitionInTransaction;
let loadProfileBlockTransitionBootstrap: typeof CoreServices.loadProfileBlockTransitionBootstrap;
let localInstanceId: string;
const testProfileIds = new Set<string>();
const testInstanceIds = new Set<string>();

before(async () => {
  process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
  process.env.PUBLIC_ORIGIN = publicOrigin;
  ({
    ActivityPubActors,
    db,
    firstOrThrow,
    Instances,
    pg,
    ProfileBlockActivities,
    ProfileBlocks,
    Profiles,
  } = await import('@kosmo/core/db'));
  const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
  const { localInstance } = await seedDatabase({ publicOrigin });
  localInstanceId = localInstance.id;
  ({ handleInboundBlock, handleInboundUndoBlock } = await import('./inbound-profile-block'));
  ({ executeProfileBlockTransitionInTransaction, loadProfileBlockTransitionBootstrap } =
    await import('@kosmo/core/services'));
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

test('인증된 inbound Block과 embedded Undo는 같은 원본으로 기존 관계를 생성·해제한다', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-1`),
    object: fixture.localActorUri,
  });

  await handleInboundBlock(createContext(fixture.localProfile.id), block);

  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.ownerProfileId, fixture.remoteProfile.id))
      .then((rows) => rows.length),
    1,
  );
  assert.deepEqual(
    await db
      .select({
        actorUri: ProfileBlockActivities.actorUri,
        objectUri: ProfileBlockActivities.objectUri,
        origin: ProfileBlockActivities.origin,
        state: ProfileBlockActivities.state,
      })
      .from(ProfileBlockActivities),
    [
      {
        actorUri: fixture.remoteActorUri.href,
        objectUri: fixture.localActorUri.href,
        origin: 'INBOUND',
        state: 'ACTIVE',
      },
    ],
  );

  const undoHandled = await handleInboundUndoBlock({
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: new Block({
      actor: fixture.remoteActorUri,
      id: block.id,
      object: fixture.localActorUri,
    }),
    objectUri: block.id,
    remoteActorProfileId: fixture.remoteProfile.id,
  });
  assert.equal(undoHandled, true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
  assert.deepEqual(
    await db.select({ state: ProfileBlockActivities.state }).from(ProfileBlockActivities),
    [{ state: 'CLOSED' }],
  );
});

test('검증된 embedded Undo가 먼저 오면 tombstone이 늦은 Block을 막는다', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-before-undo`),
    object: fixture.localActorUri,
  });

  assert.equal(
    await handleInboundUndoBlock({
      context: createContext(fixture.localProfile.id),
      actorUri: fixture.remoteActorUri,
      embedded: block,
      objectUri: block.id,
      remoteActorProfileId: fixture.remoteProfile.id,
    }),
    true,
  );
  await handleInboundBlock(createContext(fixture.localProfile.id), block);

  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
  assert.deepEqual(
    await db.select({ state: ProfileBlockActivities.state }).from(ProfileBlockActivities),
    [{ state: 'CLOSED' }],
  );
});

test('Block commit wins the Undo tombstone race and is routed through normal Unblock', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-race`),
    object: fixture.localActorUri,
  });
  const bootstrap = await loadProfileBlockTransitionBootstrap({
    firstProfileId: fixture.remoteProfile.id,
    secondProfileId: fixture.localProfile.id,
  });

  let releaseBlockCommit!: () => void;
  const blockCommitRelease = new Promise<void>((resolve) => {
    releaseBlockCommit = resolve;
  });
  let blockTransactionReady!: () => void;
  const blockTransactionReadyPromise = new Promise<void>((resolve) => {
    blockTransactionReady = resolve;
  });
  const blockTransaction = db.transaction(async (tx) => {
    const execution = await executeProfileBlockTransitionInTransaction(
      {
        cleanupSources: bootstrap.cleanupSources,
        candidateProfileBlockId: bootstrap.candidateProfileBlockId,
        origin: 'ACTIVITYPUB',
        ownerProfileId: fixture.remoteProfile.id,
        protocolActivity: {
          activityUri: block.id!.href,
          actorUri: fixture.remoteActorUri.href,
          objectUri: fixture.localActorUri.href,
          origin: 'INBOUND',
          ownerProfileId: fixture.remoteProfile.id,
          targetProfileId: fixture.localProfile.id,
        },
        targetProfileId: fixture.localProfile.id,
      },
      tx,
    );
    assert.equal(execution.ok, true);
    blockTransactionReady();
    await blockCommitRelease;
  });
  await blockTransactionReadyPromise;

  const undoPromise = handleInboundUndoBlock({
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: block,
    objectUri: block.id,
    remoteActorProfileId: fixture.remoteProfile.id,
  });

  let blocked = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS "count"
        FROM pg_stat_activity
       WHERE wait_event_type = 'Lock'
         AND query ILIKE ${'%profile_block_activity%'}
    `);
    if ((rows[0]?.count ?? 0) > 0) {
      blocked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(blocked, true);

  releaseBlockCommit();
  await blockTransaction;
  assert.equal(await undoPromise, true);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const profileBlocks = await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.ownerProfileId, fixture.remoteProfile.id));
    if (profileBlocks.length === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.ownerProfileId, fixture.remoteProfile.id))
      .then((rows) => rows.length),
    0,
  );
  assert.deepEqual(
    await db
      .select({ state: ProfileBlockActivities.state })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.activityUri, block.id!.href)),
    [{ state: 'CLOSED' }],
  );
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
