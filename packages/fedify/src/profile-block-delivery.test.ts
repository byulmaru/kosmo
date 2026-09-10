import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import { Block, Undo } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { localOutboundFederation as LocalOutboundFederation } from './local-outbound-federation';
import type * as ProfileBlockDelivery from './profile-block-delivery';

const publicOrigin = 'http://127.0.0.1:4173';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let localOutboundFederation: typeof LocalOutboundFederation;
let pg: typeof CoreDb.pg;
let ProfileBlockActivities: typeof CoreDb.ProfileBlockActivities;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let sendProfileBlock: typeof ProfileBlockDelivery.sendProfileBlock;
let sendProfileBlockUndo: typeof ProfileBlockDelivery.sendProfileBlockUndo;
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
    ProfileFollows,
    Profiles,
  } = await import('@kosmo/core/db'));
  const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
  ({ localOutboundFederation } = await import('./local-outbound-federation'));
  ({ sendProfileBlock, sendProfileBlockUndo } = await import('./profile-block-delivery'));
  const { localInstance } = await seedDatabase({ publicOrigin });
  localInstanceId = localInstance.id;
});

afterEach(async () => {
  mock.restoreAll();
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

test('Block과 Undo는 직접 target만 수신하고 관계 삭제 뒤에도 stable identity로 재시도한다', async () => {
  const fixture = await createFixture();
  const profileBlock = await db
    .insert(ProfileBlocks)
    .values({ ownerProfileId: fixture.localProfileId, targetProfileId: fixture.remoteProfileId })
    .returning()
    .then(firstOrThrow);
  await db.insert(ProfileFollows).values({
    followerProfileId: fixture.followerProfileId,
    followeeProfileId: fixture.localProfileId,
  });

  const contextFixture = createContextFixture();
  mock.method(localOutboundFederation, 'createContext', () => contextFixture.context);

  assert.deepEqual(await sendProfileBlock(profileBlock.id, { createIfMissing: true }), {
    status: 'SETTLED',
  });
  assert.equal(contextFixture.calls.length, 1);
  const blockCall = contextFixture.calls[0];
  assert.ok(blockCall?.activity instanceof Block);
  assert.equal(blockCall.activity.id?.href, `${publicOrigin}/ap/block/${profileBlock.id}`);
  assert.deepEqual(
    blockCall.recipients.map((recipient) => recipient.id?.href),
    [fixture.remoteActorUri],
  );
  assert.deepEqual(blockCall.options, {
    orderingKey: `profile-block:${publicOrigin}/ap/actor/${fixture.localProfileId}\n${fixture.remoteActorUri}`,
    preferSharedInbox: true,
  });

  const storedActivity = await db
    .select()
    .from(ProfileBlockActivities)
    .where(eq(ProfileBlockActivities.profileBlockId, profileBlock.id))
    .then((rows) => rows[0]);
  assert.equal(storedActivity?.deliveryState, 'SETTLED');

  await db.delete(ProfileBlocks).where(eq(ProfileBlocks.id, profileBlock.id));

  assert.deepEqual(
    await sendProfileBlockUndo({
      ownerProfileId: fixture.localProfileId,
      profileBlockId: profileBlock.id,
      targetProfileId: fixture.remoteProfileId,
    }),
    { status: 'SETTLED' },
  );
  assert.equal(contextFixture.calls.length, 2);
  const undoCall = contextFixture.calls[1];
  assert.ok(undoCall?.activity instanceof Undo);
  assert.equal(undoCall.activity.id?.href, `${publicOrigin}/ap/block/${profileBlock.id}/undo`);
  assert.deepEqual(
    undoCall.recipients.map((recipient) => recipient.id?.href),
    [fixture.remoteActorUri],
  );
  const originalBlock = await undoCall.activity.getObject();
  assert.ok(originalBlock instanceof Block);
  assert.equal(originalBlock.id?.href, `${publicOrigin}/ap/block/${profileBlock.id}`);
  assert.deepEqual(undoCall.options, {
    orderingKey: `profile-block:${publicOrigin}/ap/actor/${fixture.localProfileId}\n${fixture.remoteActorUri}`,
    preferSharedInbox: true,
  });

  const settledActivity = await db
    .select()
    .from(ProfileBlockActivities)
    .where(eq(ProfileBlockActivities.activityUri, `${publicOrigin}/ap/block/${profileBlock.id}`))
    .then((rows) => rows[0]);
  assert.equal(settledActivity?.undoDeliveryState, 'SETTLED');
});

type SendActivityCall = {
  readonly activity: Activity;
  readonly options: { readonly orderingKey?: string; readonly preferSharedInbox?: boolean };
  readonly recipients: Recipient[];
};

const createContextFixture = () => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async (
      _sender: { identifier: string },
      recipients: Recipient | Recipient[],
      activity: Activity,
      options: { orderingKey?: string; preferSharedInbox?: boolean },
    ) => {
      calls.push({
        activity,
        options,
        recipients: Array.isArray(recipients) ? recipients : [recipients],
      });
    },
  } as Context<void>;
  return { calls, context };
};

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
  const followerInstance = await db
    .insert(Instances)
    .values({
      domain: `follower-${crypto.randomUUID()}.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  testInstanceIds.add(followerInstance.id);
  const localHandle = `local-${crypto.randomUUID()}`;
  const remoteHandle = `remote-${crypto.randomUUID()}`;
  const followerHandle = `follower-${crypto.randomUUID()}`;
  const localProfile = await db
    .insert(Profiles)
    .values({
      displayName: localHandle,
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
      displayName: remoteHandle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: remoteHandle,
      instanceId: remoteInstance.id,
      normalizedHandle: remoteHandle,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.add(remoteProfile.id);
  const followerProfile = await db
    .insert(Profiles)
    .values({
      displayName: followerHandle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: followerHandle,
      instanceId: followerInstance.id,
      normalizedHandle: followerHandle,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.add(followerProfile.id);
  const remoteActorUri = `https://${remoteInstance.domain}/users/${remoteHandle}`;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${remoteActorUri}/inbox`,
    profileId: remoteProfile.id,
    type: ActivityPubActorType.PERSON,
    uri: remoteActorUri,
  });
  await db.insert(ActivityPubActors).values({
    inboxUri: `https://${followerInstance.domain}/users/${followerHandle}/inbox`,
    profileId: followerProfile.id,
    type: ActivityPubActorType.PERSON,
    uri: `https://${followerInstance.domain}/users/${followerHandle}`,
  });

  return {
    followerProfileId: followerProfile.id,
    localProfileId: localProfile.id,
    remoteActorUri,
    remoteProfileId: remoteProfile.id,
  };
};
