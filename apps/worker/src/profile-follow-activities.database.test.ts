import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import { Follow, Undo } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as Federation } from '@kosmo/fedify';
import type * as ProfileFollowActivities from './profile-follow-activities';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const profileFollowCreatedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_ORIGIN = publicOrigin;

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof Federation;
let sendProfileFollowActivity: typeof ProfileFollowActivities.sendProfileFollowActivity;
let sendProfileUnfollowActivity: typeof ProfileFollowActivities.sendProfileUnfollowActivity;

describe('profile follow delivery activities', () => {
  before(async () => {
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
    ({ federation } = await import('@kosmo/fedify'));
    ({ sendProfileFollowActivity, sendProfileUnfollowActivity } =
      await import('./profile-follow-activities'));

    await seedDatabase({ publicOrigin });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await pg.end();
  });

  test('source 종류별 Follow가 동일한 identity와 ordering으로 발송된다', async () => {
    const firstFixture = await createFollowFixture();
    const secondFixture = await createFollowFixture();
    const firstFollow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: firstFixture.follower.id,
        followeeProfileId: firstFixture.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    const secondRequest = await db
      .insert(ProfileFollowRequests)
      .values({
        followerProfileId: secondFixture.follower.id,
        followeeProfileId: secondFixture.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileFollowActivity({ sourceKind: 'FOLLOW', sourceId: firstFollow.id });
    await sendProfileFollowActivity({
      sourceKind: 'FOLLOW_REQUEST',
      sourceId: secondRequest.id,
    });

    assert.equal(fixture.calls.length, 2);
    for (const [call, source, followId] of [
      [fixture.calls[0], firstFixture, firstFollow.id],
      [fixture.calls[1], secondFixture, secondRequest.id],
    ] as const) {
      assert.ok(call?.activity instanceof Follow);
      assert.equal(call.activity.id?.href, `${publicOrigin}/ap/follow/${followId}`);
      assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${source.follower.id}`);
      assert.equal(call.activity.objectId?.href, source.actor.uri);
      assert.deepEqual(
        call.activity.toIds.map((uri) => uri.href),
        [source.actor.uri],
      );
      assert.deepEqual(call.sender, { identifier: source.follower.id });
      assert.deepEqual(call.options, {
        orderingKey: `profile-follow:${publicOrigin}/ap/actor/${source.follower.id}\n${source.actor.uri}`,
      });
    }
  });

  test('삭제 snapshot의 source identity 불일치를 전송 전에 거부한다', async () => {
    await assert.rejects(
      sendProfileUnfollowActivity({
        createdAt: profileFollowCreatedAt.toString(),
        followerProfileId: crypto.randomUUID(),
        followeeProfileId: crypto.randomUUID(),
        id: crypto.randomUUID(),
        sourceId: crypto.randomUUID(),
      }),
      /source identity mismatch/,
    );
  });

  test('커밋된 전송은 이후 participant state 변경으로 취소하지 않는다', async () => {
    const source = await createFollowFixture();
    const follow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: source.follower.id,
        followeeProfileId: source.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, source.follower.id));
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, source.follower.instanceId));
    await db
      .update(Instances)
      .set({ state: InstanceState.UNRESPONSIVE })
      .where(eq(Instances.id, source.followee.instanceId));
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileFollowActivity({ sourceKind: 'FOLLOW', sourceId: follow.id });
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, follow.id));
    await sendProfileUnfollowActivity({
      createdAt: follow.createdAt.toString(),
      followerProfileId: follow.followerProfileId,
      followeeProfileId: follow.followeeProfileId,
      id: follow.id,
      sourceId: follow.id,
    });

    assert.equal(fixture.calls.length, 2);
    assert.ok(fixture.calls[0]?.activity instanceof Follow);
    assert.ok(fixture.calls[1]?.activity instanceof Undo);
  });

  test('삭제된 create source와 non-ActivityPub projection은 성공한 no-op이다', async () => {
    const deletedSource = await createFollowFixture();
    const deletedFollow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: deletedSource.follower.id,
        followeeProfileId: deletedSource.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, deletedFollow.id));
    const localFollowee = await createFollowFixture({ followeeKind: InstanceKind.LOCAL });
    const localFollow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: localFollowee.follower.id,
        followeeProfileId: localFollowee.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileFollowActivity({ sourceKind: 'FOLLOW', sourceId: deletedFollow.id });
    await sendProfileFollowActivity({ sourceKind: 'FOLLOW', sourceId: localFollow.id });

    assert.equal(fixture.calls.length, 0);
  });

  test('ActivityPub recipient endpoint 결손은 성공으로 숨기지 않는다', async () => {
    const source = await createFollowFixture();
    const follow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: source.follower.id,
        followeeProfileId: source.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .update(ActivityPubActors)
      .set({ inboxUri: null })
      .where(eq(ActivityPubActors.profileId, source.followee.id));

    await assert.rejects(
      sendProfileFollowActivity({ sourceKind: 'FOLLOW', sourceId: follow.id }),
      /recipient projection is incomplete/,
    );
    await assert.rejects(
      sendProfileUnfollowActivity({
        createdAt: follow.createdAt.toString(),
        followerProfileId: follow.followerProfileId,
        followeeProfileId: follow.followeeProfileId,
        id: follow.id,
        sourceId: follow.id,
      }),
      /recipient projection is incomplete/,
    );
  });

  test('삭제 snapshot은 삭제된 source를 재조회하지 않고 동일한 Undo identity와 ordering을 쓴다', async () => {
    const source = await createFollowFixture();
    const deleted = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: source.follower.id,
        followeeProfileId: source.followee.id,
      })
      .returning()
      .then(firstOrThrow);
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, deleted.id));
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileUnfollowActivity({
      createdAt: deleted.createdAt.toString(),
      followerProfileId: deleted.followerProfileId,
      followeeProfileId: deleted.followeeProfileId,
      id: deleted.id,
      sourceId: deleted.id,
    });

    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Undo);
    assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${source.follower.id}`);
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [source.actor.uri],
    );
    const originalFollow = await call.activity.getObject();
    assert.ok(originalFollow instanceof Follow);
    assert.equal(originalFollow.id?.href, `${publicOrigin}/ap/follow/${deleted.id}`);
    assert.equal(originalFollow.published?.toString(), deleted.createdAt.toString());
    assert.deepEqual(call.options, {
      orderingKey: `profile-follow:${publicOrigin}/ap/actor/${source.follower.id}\n${source.actor.uri}`,
    });
  });
});

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly orderingKey?: string } | undefined;
  readonly recipient: Recipient;
  readonly sender: { readonly identifier: string };
}

const createContextFixture = () => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipient: Recipient,
      activity: Activity,
      options?: { orderingKey?: string },
    ) => {
      calls.push({ activity, options, recipient, sender });
    },
  } as Context<void>;

  return { calls, context };
};

const createFollowFixture = async ({
  followeeKind = InstanceKind.ACTIVITYPUB,
}: {
  readonly followeeKind?: InstanceKind;
} = {}) => {
  const suffix = crypto.randomUUID();
  const followerInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${suffix}.local.example`,
      domain: `${suffix}.local.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const follower = await db
    .insert(Profiles)
    .values({
      displayName: `follower-${suffix}`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `follower-${suffix}`,
      instanceId: followerInstance.id,
      normalizedHandle: `follower-${suffix}`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const followeeInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${suffix}.remote.example`,
      domain: `${suffix}.remote.example`,
      kind: followeeKind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const followee = await db
    .insert(Profiles)
    .values({
      displayName: `followee-${suffix}`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `followee-${suffix}`,
      instanceId: followeeInstance.id,
      normalizedHandle: `followee-${suffix}`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const actor = {
    inboxUri: `https://${suffix}.remote.example/inbox`,
    sharedInboxUri: `https://${suffix}.remote.example/shared-inbox`,
    uri: `https://${suffix}.remote.example/users/followee`,
  };
  await db.insert(ActivityPubActors).values({
    ...actor,
    profileId: followee.id,
    type: ActivityPubActorType.PERSON,
  });

  return { actor, followee, follower };
};
