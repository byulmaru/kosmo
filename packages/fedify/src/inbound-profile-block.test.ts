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
let ProfileBlockActivities: typeof CoreDb.ProfileBlockActivities;
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
    undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-block-1`),
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
    await db
      .select({ state: ProfileBlockActivities.state })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.activityUri, block.id!.href)),
    [{ state: 'CLOSED' }],
  );

  assert.equal(
    await handleInboundUndoBlock({
      context: createContext(fixture.localProfile.id),
      actorUri: fixture.remoteActorUri,
      undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-block-1`),
      embedded: new Block({
        actor: fixture.remoteActorUri,
        id: block.id,
        object: fixture.localActorUri,
      }),
      objectUri: block.id,
      remoteActorProfileId: fixture.remoteProfile.id,
    }),
    true,
  );
  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
});

test('원본 URI가 달라도 검증된 pair의 현재 차단을 해제하고 같은 Undo 재전달은 새 차단을 유지한다', async () => {
  const fixture = await createFixture();
  const first = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-first`),
    object: fixture.localActorUri,
  });
  const second = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-second`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), first);
  await handleInboundBlock(createContext(fixture.localProfile.id), second);

  const undo = {
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: new Block({
      actor: fixture.remoteActorUri,
      id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/alternate-block-uri`),
      object: fixture.localActorUri,
    }),
    objectUri: first.id,
    remoteActorProfileId: fixture.remoteProfile.id,
    undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-alternate`),
  };
  assert.equal(await handleInboundUndoBlock(undo), true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
  assert.deepEqual(
    await db
      .select({ state: ProfileBlockActivities.state })
      .from(ProfileBlockActivities)
      .where(inArray(ProfileBlockActivities.activityUri, [first.id!.href, second.id!.href])),
    [{ state: 'CLOSED' }, { state: 'CLOSED' }],
  );

  const replacement = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-replacement`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), replacement);
  assert.equal(await handleInboundUndoBlock(undo), true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
});

test('종료된 과거 Block URI를 담은 새로운 Undo는 새 차단을 유지한다', async () => {
  const fixture = await createFixture();
  const first = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/old-block`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), first);
  const input = {
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: first,
    objectUri: first.id,
    remoteActorProfileId: fixture.remoteProfile.id,
  };
  assert.equal(
    await handleInboundUndoBlock({
      ...input,
      undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-old`),
    }),
    true,
  );
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({
      actor: fixture.remoteActorUri,
      id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/new-block`),
      object: fixture.localActorUri,
    }),
  );
  const blocksBeforeUndo = await db.select().from(ProfileBlocks);
  const activitiesBeforeUndo = await db
    .select()
    .from(ProfileBlockActivities)
    .orderBy(ProfileBlockActivities.activityUri);
  assert.equal(blocksBeforeUndo.length, 1);

  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(
      await handleInboundUndoBlock({
        ...input,
        undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/new-undo`),
      }),
      true,
    );
    assert.deepEqual(await db.select().from(ProfileBlocks), blocksBeforeUndo);
    assert.deepEqual(
      await db.select().from(ProfileBlockActivities).orderBy(ProfileBlockActivities.activityUri),
      activitiesBeforeUndo,
    );
  }
});

test('embedded Block 원본 ID가 없어도 Undo ID와 검증된 pair로 해제한다', async () => {
  const fixture = await createFixture();
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({
      actor: fixture.remoteActorUri,
      id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-idless-undo`),
      object: fixture.localActorUri,
    }),
  );

  assert.equal(
    await handleInboundUndoBlock({
      context: createContext(fixture.localProfile.id),
      actorUri: fixture.remoteActorUri,
      embedded: new Block({
        actor: fixture.remoteActorUri,
        object: fixture.localActorUri,
      }),
      objectUri: null,
      remoteActorProfileId: fixture.remoteProfile.id,
      undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-idless`),
    }),
    true,
  );
  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
});

test('차단보다 먼저 온 원본 ID 없는 Undo의 재전달은 새 차단을 해제하지 않는다', async () => {
  const fixture = await createFixture();
  const input = {
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: new Block({
      actor: fixture.remoteActorUri,
      object: fixture.localActorUri,
    }),
    objectUri: null,
    remoteActorProfileId: fixture.remoteProfile.id,
    undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-before-block`),
  };
  assert.equal(await handleInboundUndoBlock(input), true);
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({
      actor: fixture.remoteActorUri,
      id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-after-undo`),
      object: fixture.localActorUri,
    }),
  );
  assert.equal(await handleInboundUndoBlock(input), true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
});

test('Undo Activity ID가 없으면 원본 Block ID가 있어도 관계를 변경하지 않는다', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-without-undo-id`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), block);
  const input = {
    context: createContext(fixture.localProfile.id),
    actorUri: fixture.remoteActorUri,
    embedded: block,
    objectUri: block.id,
    remoteActorProfileId: fixture.remoteProfile.id,
  };
  assert.equal(await handleInboundUndoBlock(input), true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
  assert.equal(
    await handleInboundUndoBlock({
      ...input,
      undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/valid-undo`),
    }),
    true,
  );
  await handleInboundBlock(
    createContext(fixture.localProfile.id),
    new Block({
      actor: fixture.remoteActorUri,
      id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/replacement-block`),
      object: fixture.localActorUri,
    }),
  );
  assert.equal(await handleInboundUndoBlock(input), true);
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
});

test('Block actor 또는 Local Target이 다른 Undo는 URI가 달라도 현재 pair를 해제하지 않는다', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-guard`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), block);

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
        undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-invalid`),
      }),
      true,
    );
  }
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
  assert.deepEqual(
    await db
      .select({ state: ProfileBlockActivities.state })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.activityUri, block.id!.href)),
    [{ state: 'ACTIVE' }],
  );
});

test('Block URI를 재사용한 다른 타입의 embedded Undo는 Block 해제로 소비하지 않는다', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-type-guard`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), block);

  assert.equal(
    await handleInboundUndoBlock({
      context: createContext(fixture.localProfile.id),
      actorUri: fixture.remoteActorUri,
      embedded: { id: block.id },
      objectUri: block.id,
      remoteActorProfileId: fixture.remoteProfile.id,
    }),
    false,
  );
  assert.equal((await db.select().from(ProfileBlocks)).length, 1);
  assert.deepEqual(
    await db.select({ state: ProfileBlockActivities.state }).from(ProfileBlockActivities),
    [{ state: 'ACTIVE' }],
  );
});

test('저장된 Block URI만 참조하는 Undo는 Block 해제로 추론하지 않는다', async () => {
  const fixture = await createFixture();
  const block = new Block({
    actor: fixture.remoteActorUri,
    id: new URL(`https://${fixture.remoteActorUri.hostname}/activities/block-uri-only`),
    object: fixture.localActorUri,
  });
  await handleInboundBlock(createContext(fixture.localProfile.id), block);

  assert.equal(
    await handleInboundUndoBlock({
      context: createContext(fixture.localProfile.id),
      actorUri: fixture.remoteActorUri,
      embedded: null,
      objectUri: block.id,
      remoteActorProfileId: fixture.remoteProfile.id,
    }),
    false,
  );
  assert.deepEqual(
    await db
      .select({ state: ProfileBlockActivities.state })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.activityUri, block.id!.href)),
    [{ state: 'ACTIVE' }],
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
      undoUri: new URL(`https://${fixture.remoteActorUri.hostname}/activities/undo-before-block`),
      embedded: block,
      objectUri: block.id,
      remoteActorProfileId: fixture.remoteProfile.id,
    }),
    true,
  );
  await handleInboundBlock(createContext(fixture.localProfile.id), block);

  assert.equal((await db.select().from(ProfileBlocks)).length, 0);
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
