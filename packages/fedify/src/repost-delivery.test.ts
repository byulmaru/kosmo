import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { Announce, PUBLIC_COLLECTION, Undo } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as Federation } from './federation';
import type * as RepostDelivery from './repost-delivery';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let federation: typeof Federation;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let sendRepostAnnounce: typeof RepostDelivery.sendRepostAnnounce;
let sendRepostUndo: typeof RepostDelivery.sendRepostUndo;
let testInstanceIds: string[] = [];
let testProfileIds: string[] = [];

describe('ActivityPub Local Repost delivery', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      pg,
      PostContents,
      Posts,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ federation } = await import('./federation'));
    ({ sendRepostAnnounce, sendRepostUndo } = await import('./repost-delivery'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await cleanTestRows();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await cleanTestRows();
    await pg.end();
  });

  test('Local Source Announce identity와 Unlisted audience를 remote follower에게 전달한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const source = await createContentPost(author.id);
    const repost = await createRepost(author.id, source.id);
    const activeFollower = await createRemoteActorProfile({ sharedInbox: true });
    const unresponsiveFollower = await createRemoteActorProfile({
      instanceState: InstanceState.UNRESPONSIVE,
    });
    const suspendedFollower = await createRemoteActorProfile({
      instanceState: InstanceState.SUSPENDED,
    });
    const inactiveFollower = await createRemoteActorProfile({
      profileState: ProfileState.DISABLED,
    });
    const noInboxFollower = await createRemoteActorProfile({ inbox: false });
    const localFollower = await createProfile({ kind: InstanceKind.LOCAL });

    await db
      .insert(ProfileFollows)
      .values(
        [
          activeFollower,
          unresponsiveFollower,
          suspendedFollower,
          inactiveFollower,
          noInboxFollower,
          localFollower,
        ].map(({ id }) => ({ followeeProfileId: author.id, followerProfileId: id })),
      );

    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendRepostAnnounce(repost.id);

    assert.equal(fixture.calls.length, 1);
    const call = fixture.calls[0]!;
    assert.ok(call.activity instanceof Announce);
    assert.equal(call.activity.id?.href, `${publicOrigin}/ap/announce/${repost.id}`);
    assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${author.id}`);
    assert.equal(call.activity.objectId?.href, `${publicOrigin}/ap/note/${source.id}`);
    assert.equal(call.activity.published?.toString(), repost.createdAt.toString());
    assert.deepEqual(call.activity.toIds.map(String), [
      `${publicOrigin}/ap/actor/${author.id}/followers`,
    ]);
    assert.deepEqual(call.activity.ccIds.map(String), [PUBLIC_COLLECTION.href]);
    assert.deepEqual(
      call.recipients.map(({ id }) => id?.href).sort(),
      [activeFollower.actorUri, unresponsiveFollower.actorUri].sort(),
    );
    const activeRecipient = call.recipients.find(({ id }) => id?.href === activeFollower.actorUri);
    assert.equal(activeRecipient?.endpoints?.sharedInbox?.href, activeFollower.sharedInboxUri);
    assert.deepEqual(call.options, {
      orderingKey: `activitypub-repost:${repost.id}`,
      preferSharedInbox: true,
    });
  });

  test('Followers Only Announce는 Public audience를 포함하지 않는다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const source = await createContentPost(author.id, PostVisibility.FOLLOWERS);
    const repost = await createRepost(author.id, source.id, PostVisibility.FOLLOWERS);
    const follower = await createRemoteActorProfile();
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.id,
    });
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendRepostAnnounce(repost.id);

    const activity = fixture.calls[0]?.activity;
    assert.ok(activity instanceof Announce);
    assert.deepEqual(activity.ccIds, []);
    assert.deepEqual(activity.toIds.map(String), [
      `${publicOrigin}/ap/actor/${author.id}/followers`,
    ]);
  });

  test('Remote Source identity를 재사용하고 Source Tombstone 뒤 exact Undo를 만든다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const sourceAuthor = await createProfile({ kind: InstanceKind.ACTIVITYPUB });
    const source = await createContentPost(sourceAuthor.id);
    const remoteObjectUri = `https://${sourceAuthor.instanceDomain}/objects/${source.id}`;
    await db.insert(ActivityPubPosts).values({
      postId: source.id,
      receivedAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
      uri: remoteObjectUri,
    });
    const repost = await createRepost(author.id, source.id);
    const follower = await createRemoteActorProfile();
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.id,
    });
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendRepostAnnounce(repost.id);
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, source.id));
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, repost.id));
    await sendRepostUndo(repost.id);

    assert.equal(fixture.calls.length, 2);
    const original = fixture.calls[0]!.activity;
    const undo = fixture.calls[1]!.activity;
    assert.ok(original instanceof Announce);
    assert.equal(original.objectId?.href, remoteObjectUri);
    assert.ok(undo instanceof Undo);
    assert.equal(undo.id?.href, `${publicOrigin}/ap/announce/${repost.id}#undo`);
    assert.equal(undo.actorId?.href, original.actorId?.href);
    const embedded = await undo.getObject();
    assert.ok(embedded instanceof Announce);
    assert.equal(embedded.id?.href, original.id?.href);
    assert.equal(embedded.actorId?.href, original.actorId?.href);
    assert.equal(embedded.objectId?.href, original.objectId?.href);
    assert.equal(embedded.published?.toString(), original.published?.toString());
    assert.equal(fixture.calls[1]!.options.orderingKey, fixture.calls[0]!.options.orderingKey);
  });

  test('disabled Profile의 Tombstone Repost도 Undo를 queue에 handoff한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const sourceAuthor = await createProfile({ kind: InstanceKind.ACTIVITYPUB });
    const source = await createContentPost(sourceAuthor.id);
    const remoteObjectUri = `https://${sourceAuthor.instanceDomain}/objects/${source.id}`;
    await db.insert(ActivityPubPosts).values({
      postId: source.id,
      receivedAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
      uri: remoteObjectUri,
    });
    const repost = await createRepost(author.id, source.id);
    const follower = await createRemoteActorProfile();
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.id,
    });
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendRepostAnnounce(repost.id);
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, repost.id));
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, author.id));

    await sendRepostUndo(repost.id);

    assert.equal(fixture.calls.length, 2);
    const undo = fixture.calls[1]!.activity;
    assert.ok(undo instanceof Undo);
    assert.equal(undo.id?.href, `${publicOrigin}/ap/announce/${repost.id}#undo`);
    const embedded = await undo.getObject();
    assert.ok(embedded instanceof Announce);
    assert.equal(embedded.id?.href, `${publicOrigin}/ap/announce/${repost.id}`);
    assert.equal(fixture.calls[1]!.options.orderingKey, `activitypub-repost:${repost.id}`);
  });

  test('unsupported 또는 unavailable projection과 recipient 부재는 전송하지 않는다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const follower = await createRemoteActorProfile();
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.id,
    });
    const source = await createContentPost(author.id);
    const quote = await createContentPost(author.id);
    await db.update(Posts).set({ repostSourceId: source.id }).where(eq(Posts.id, quote.id));
    const contentlessSource = await createRepost(author.id, source.id);
    const nested = await createRepost(author.id, contentlessSource.id);
    const remoteAuthor = await createProfile({ kind: InstanceKind.ACTIVITYPUB });
    const unmappedRemoteSource = await createContentPost(remoteAuthor.id);
    const unmapped = await createRepost(author.id, unmappedRemoteSource.id);
    const inactiveAuthor = await createProfile({
      kind: InstanceKind.LOCAL,
      profileState: ProfileState.DISABLED,
    });
    const inactiveSource = await createContentPost(inactiveAuthor.id);
    const inactive = await createRepost(inactiveAuthor.id, inactiveSource.id);
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendRepostAnnounce(quote.id);
    await sendRepostAnnounce(nested.id);
    await sendRepostAnnounce(unmapped.id);
    await sendRepostAnnounce(inactive.id);
    await sendRepostAnnounce(crypto.randomUUID());

    assert.equal(fixture.calls.length, 0);
  });

  test('Source Author는 follower가 아니면 recipient로 암묵 추가하지 않는다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const sourceAuthor = await createRemoteActorProfile();
    const source = await createContentPost(sourceAuthor.id);
    await db.insert(ActivityPubPosts).values({
      postId: source.id,
      receivedAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
      uri: `https://${sourceAuthor.instanceDomain}/objects/${source.id}`,
    });
    const repost = await createRepost(author.id, source.id);
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendRepostAnnounce(repost.id);

    assert.equal(fixture.calls.length, 0);
  });
});

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly orderingKey: string; readonly preferSharedInbox: boolean };
  readonly recipients: Recipient[];
  readonly sender: { readonly identifier: string };
}

const createContextFixture = () => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipients: Recipient[],
      activity: Activity,
      options: { orderingKey: string; preferSharedInbox: boolean },
    ) => {
      calls.push({ activity, options, recipients, sender });
    },
  } as unknown as Context<void>;
  return { calls, context };
};

const createProfile = async ({
  kind,
  profileState = ProfileState.ACTIVE,
}: {
  kind: InstanceKind;
  profileState?: ProfileState;
}) => {
  const suffix = crypto.randomUUID();
  const instance =
    kind === InstanceKind.LOCAL
      ? await db
          .select()
          .from(Instances)
          .where(eq(Instances.id, localInstanceId))
          .then(firstOrThrow)
      : await db
          .insert(Instances)
          .values({
            domain: `${suffix}.remote.example`,
            kind,
            state: InstanceState.ACTIVE,
          })
          .returning()
          .then(firstOrThrow);
  if (kind !== InstanceKind.LOCAL) {
    testInstanceIds.push(instance.id);
  }
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.push(profile.id);
  return { ...profile, instanceDomain: instance.domain };
};

const createRemoteActorProfile = async ({
  inbox = true,
  instanceState = InstanceState.ACTIVE,
  profileState = ProfileState.ACTIVE,
  sharedInbox = false,
}: {
  inbox?: boolean;
  instanceState?: InstanceState;
  profileState?: ProfileState;
  sharedInbox?: boolean;
} = {}) => {
  const profile = await createProfile({ kind: InstanceKind.ACTIVITYPUB, profileState });
  await db
    .update(Instances)
    .set({ state: instanceState })
    .where(eq(Instances.id, profile.instanceId));
  const actorUri = `https://${profile.instanceDomain}/users/${profile.id}`;
  const sharedInboxUri = sharedInbox ? `https://${profile.instanceDomain}/inbox` : null;
  await db.insert(ActivityPubActors).values({
    inboxUri: inbox ? `${actorUri}/inbox` : null,
    profileId: profile.id,
    sharedInboxUri,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  return { ...profile, actorUri, sharedInboxUri };
};

const createContentPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: {
        body: {
          content: [{ content: [{ text: 'body', type: 'text' }], type: 'paragraph' }],
          type: 'doc',
        },
        summary: null,
        version: 1,
      },
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);
  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createRepost = async (
  profileId: string,
  sourceId: string,
  visibility: PostVisibility = PostVisibility.UNLISTED,
) =>
  db
    .insert(Posts)
    .values({
      profileId,
      repostSourceId: sourceId,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);

const cleanTestRows = async () => {
  if (testProfileIds.length === 0) {
    return;
  }
  const postIds = await db
    .select({ id: Posts.id })
    .from(Posts)
    .where(inArray(Posts.profileId, testProfileIds))
    .then((rows) => rows.map(({ id }) => id));
  if (postIds.length > 0) {
    await db
      .update(Posts)
      .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
      .where(inArray(Posts.id, postIds));
    await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
    await db.delete(Posts).where(inArray(Posts.id, postIds));
  }
  await db.delete(Profiles).where(inArray(Profiles.id, testProfileIds));
  if (testInstanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, testInstanceIds));
  }
  testProfileIds = [];
  testInstanceIds = [];
};
