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
import type { federation as Federation } from './federation';
import type * as ProfileFollowDelivery from './profile-follow-delivery';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const senderProfileId = '019f6f67-1111-7777-8888-123456789abc';
const profileFollowId = '019f6f67-2222-7777-8888-123456789abc';
const profileFollowCreatedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');
const localActorUri = new URL(`/ap/actor/${senderProfileId}`, publicOrigin);
const remoteActorUri = new URL('https://remote.example/users/alice');
const actor = {
  inboxUri: 'https://remote.example/users/alice/inbox',
  sharedInboxUri: 'https://remote.example/inbox',
  uri: remoteActorUri.href,
};

let federation: typeof Federation;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let sendProfileFollow: typeof ProfileFollowDelivery.sendProfileFollow;
let sendProfileFollowBySource: typeof ProfileFollowDelivery.sendProfileFollowBySource;
let sendProfileUnfollow: typeof ProfileFollowDelivery.sendProfileUnfollow;
let sendProfileUnfollowBySnapshot: typeof ProfileFollowDelivery.sendProfileUnfollowBySnapshot;

describe('profile follow delivery', () => {
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
    ({ federation } = await import('./federation'));
    ({
      sendProfileFollow,
      sendProfileFollowBySource,
      sendProfileUnfollow,
      sendProfileUnfollowBySnapshot,
    } = await import('./profile-follow-delivery'));

    await seedDatabase({ publicOrigin });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await pg.end();
  });

  test('sendProfileFollow가 저장 actor inbox가 없으면 전송 전에 실패한다', async () => {
    await assert.rejects(
      sendProfileFollow({
        actor: { ...actor, inboxUri: null },
        outboundFollow: {
          createdAt: profileFollowCreatedAt,
          id: profileFollowId,
        },
        senderProfileId,
      }),
      /must have an inbox/,
    );
  });

  test('sendProfileFollow가 저장 projection으로 Follow를 구성하고 발송한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileFollow({
      actor,
      outboundFollow: {
        createdAt: profileFollowCreatedAt,
        id: profileFollowId,
      },
      senderProfileId,
    });

    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Follow);
    assert.equal(call.activity.id?.href, `${publicOrigin}/ap/follow/${profileFollowId}`);
    assert.equal(call.activity.actorId?.href, localActorUri.href);
    assert.equal(call.activity.objectId?.href, remoteActorUri.href);
    assert.equal(call.activity.published?.toString(), profileFollowCreatedAt.toString());
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [remoteActorUri.href],
    );
    assert.equal(call.recipient.id?.href, remoteActorUri.href);
    assert.equal(call.recipient.inboxId?.href, actor.inboxUri);
    assert.equal(call.recipient.endpoints?.sharedInbox?.href, actor.sharedInboxUri);
    assert.deepEqual(call.sender, { identifier: senderProfileId });
    assert.deepEqual(call.options, {
      orderingKey: `profile-follow:${localActorUri.href}\n${remoteActorUri.href}`,
    });
  });

  test('sendProfileUnfollow가 같은 projection으로 원본 Follow와 Undo를 구성한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileUnfollow({
      actor,
      outboundFollow: {
        createdAt: profileFollowCreatedAt,
        id: profileFollowId,
      },
      senderProfileId,
    });

    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Undo);
    assert.equal(call.activity.actorId?.href, localActorUri.href);
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [remoteActorUri.href],
    );
    const originalFollow = await call.activity.getObject();
    assert.ok(originalFollow instanceof Follow);
    assert.equal(originalFollow.id?.href, `${publicOrigin}/ap/follow/${profileFollowId}`);
    assert.equal(originalFollow.actorId?.href, localActorUri.href);
    assert.equal(originalFollow.objectId?.href, remoteActorUri.href);
    assert.equal(originalFollow.published?.toString(), profileFollowCreatedAt.toString());
    assert.deepEqual(call.options, {
      orderingKey: `profile-follow:${localActorUri.href}\n${remoteActorUri.href}`,
    });
  });

  test('source 종류별 Follow adapter가 동일한 identity와 ordering으로 발송한다', async () => {
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

    await sendProfileFollowBySource({ sourceKind: 'FOLLOW', sourceId: firstFollow.id });
    await sendProfileFollowBySource({
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

  test('삭제 snapshot adapter는 source identity 불일치를 전송 전에 거부한다', async () => {
    await assert.rejects(
      sendProfileUnfollowBySnapshot({
        createdAt: profileFollowCreatedAt.toString(),
        followerProfileId: senderProfileId,
        followeeProfileId: profileFollowId,
        id: profileFollowId,
        sourceId: senderProfileId,
      }),
      /source identity mismatch/,
    );
  });

  test('inactive local 또는 non-ActivityPub projection은 adapter가 no-op 처리한다', async () => {
    const inactiveFollower = await createFollowFixture({
      followerInstanceState: InstanceState.SUSPENDED,
    });
    const inactiveFollow = await db
      .insert(ProfileFollows)
      .values({
        followerProfileId: inactiveFollower.follower.id,
        followeeProfileId: inactiveFollower.followee.id,
      })
      .returning()
      .then(firstOrThrow);
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

    await sendProfileFollowBySource({ sourceKind: 'FOLLOW', sourceId: inactiveFollow.id });
    await sendProfileFollowBySource({ sourceKind: 'FOLLOW', sourceId: localFollow.id });

    assert.equal(fixture.calls.length, 0);
  });

  test('삭제 snapshot adapter는 삭제된 source를 재조회하지 않고 동일한 Undo identity와 ordering을 쓴다', async () => {
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

    await sendProfileUnfollowBySnapshot({
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
  followerInstanceState = InstanceState.ACTIVE,
  followeeKind = InstanceKind.ACTIVITYPUB,
}: {
  readonly followerInstanceState?: InstanceState;
  readonly followeeKind?: InstanceKind;
} = {}) => {
  const suffix = crypto.randomUUID();
  const followerInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${suffix}.local.example`,
      domain: `${suffix}.local.example`,
      kind: InstanceKind.LOCAL,
      state: followerInstanceState,
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
