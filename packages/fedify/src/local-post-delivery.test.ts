import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { Create, Delete, Note } from '@fedify/vocab';
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
import type { localOutboundFederation as LocalOutboundFederation } from './local-outbound-federation';
import type * as LocalPostDelivery from './local-post-delivery';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let localOutboundFederation: typeof LocalOutboundFederation;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let sendLocalPostCreate: typeof LocalPostDelivery.sendLocalPostCreate;
let sendLocalPostDelete: typeof LocalPostDelivery.sendLocalPostDelete;
let testInstanceIds: string[] = [];
let testProfileIds: string[] = [];

describe('ActivityPub Local Post delivery', () => {
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
    ({ localOutboundFederation } = await import('./local-outbound-federation'));
    ({ sendLocalPostCreate, sendLocalPostDelete } = await import('./local-post-delivery'));
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

  test('Create(Note)가 기존 projection과 stable identity를 쓰고 remote Parent Author에게 전달된다', async () => {
    const { canonicalOrigin: authorOrigin, id: authorInstanceId } = await createLocalInstance();
    const author = await createProfile({ instanceId: authorInstanceId });
    const parentAuthor = await createRemoteActor({ handle: 'parent', sharedInbox: true });
    const parent = await createPost(parentAuthor.profile.id);
    const parentUri = new URL('https://remote.example/notes/parent');
    await db.insert(ActivityPubPosts).values({
      postId: parent.id,
      receivedAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
      uri: parentUri.href,
    });
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const actualContext = localOutboundFederation.createContext(new URL(authorOrigin), {
      localInstanceId: authorInstanceId,
    });
    assert.equal(actualContext.canonicalOrigin, authorOrigin);
    assert.equal(actualContext.getActorUri(author.id).origin, authorOrigin);
    const keyPairs = await actualContext.getActorKeyPairs(author.id);
    assert.equal(keyPairs.length, 2);
    assert.ok(keyPairs.every((keyPair) => keyPair.keyId.origin === authorOrigin));
    const fixture = createContextFixture(authorOrigin);
    const createContext = mock.method(
      localOutboundFederation,
      'createContext',
      (origin: URL, data: { readonly localInstanceId: string }) => {
        assert.equal(origin.href, `${authorOrigin}/`);
        assert.equal(data.localInstanceId, authorInstanceId);
        return fixture.context;
      },
    );

    await sendLocalPostCreate(reply.id);
    await sendLocalPostCreate(reply.id);

    assert.equal(createContext.mock.callCount(), 2);
    assert.equal(fixture.calls.length, 2);
    for (const call of fixture.calls) {
      assert.ok(call.activity instanceof Create);
      assert.equal(call.activity.id?.href, `${authorOrigin}/ap/note/${reply.id}#create`);
      assert.equal(call.activity.actorId?.href, `${authorOrigin}/ap/actor/${author.id}`);
      const object = await call.activity.getObject();
      assert.ok(object instanceof Note);
      assert.equal(object.id?.href, `${authorOrigin}/ap/note/${reply.id}`);
      assert.equal(object.url && new URL(object.url.toString()).origin, publicOrigin);
      assert.equal(object.replyTargetId?.href, parentUri.href);
      assert.deepEqual(call.sender, { identifier: author.id });
      assert.deepEqual(call.options, { preferSharedInbox: true });
      assert.deepEqual(
        call.recipients.map((recipient) => recipient.id?.href),
        [parentAuthor.actorUri],
      );
      assert.equal(call.recipients[0]?.endpoints?.sharedInbox?.href, parentAuthor.sharedInboxUri);
    }
  });

  test('Public/Unlisted만 Parent Author에게 보내고 Followers·Direct·일반 Post는 no-op이다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'parent' });
    const parent = await createPost(parentAuthor.profile.id);
    const publicReply = await createPost(author.id, { replyParentId: parent.id });
    const unlistedReply = await createPost(author.id, {
      replyParentId: parent.id,
      visibility: PostVisibility.UNLISTED,
    });
    const followersReply = await createPost(author.id, {
      replyParentId: parent.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    const directReply = await createPost(author.id, {
      replyParentId: parent.id,
      visibility: PostVisibility.DIRECT,
    });
    const rootPost = await createPost(author.id);
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(publicReply.id);
    await sendLocalPostCreate(unlistedReply.id);
    await sendLocalPostCreate(followersReply.id);
    await sendLocalPostCreate(directReply.id);
    await sendLocalPostCreate(rootPost.id);

    assert.equal(fixture.calls.length, 2);
    assert.ok(
      fixture.calls.every((call) => call.recipients[0]?.id?.href === parentAuthor.actorUri),
    );
  });

  test('Root Post followers와 direct Parent target을 함께 확장하고 actor 기준으로 중복 제거한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const follower = await createRemoteActor({ handle: 'follower', sharedInbox: true });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.profile.id,
    });
    const rootPost = await createPost(author.id);
    const remoteParent = await createPost(follower.profile.id);
    const reply = await createPost(author.id, { replyParentId: remoteParent.id });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(rootPost.id);
    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(
      fixture.calls.map((call) => call.recipients.map((recipient) => recipient.id?.href)),
      [[follower.actorUri], [follower.actorUri]],
    );
  });

  test('Local Parent Reply는 Parent direct target 없이 Author followers에게만 전달한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createProfile({ kind: InstanceKind.LOCAL });
    const follower = await createRemoteActor({ handle: 'follower' });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.profile.id,
    });
    const parent = await createPost(parentAuthor.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(
      fixture.calls[0]?.recipients.map((recipient) => recipient.id?.href),
      [follower.actorUri],
    );
  });

  test('Parent endpoint는 HTTP(S)만 허용하고 invalid shared inbox는 personal inbox로 fallback한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'parent', sharedInbox: true });
    await db
      .update(ActivityPubActors)
      .set({ sharedInboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    const parent = await createPost(parentAuthor.profile.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0]?.recipients[0]?.inboxId?.href, `${parentAuthor.actorUri}/inbox`);
    assert.equal(fixture.calls[0]?.recipients[0]?.endpoints, null);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    await sendLocalPostCreate(reply.id);
    assert.equal(fixture.calls.length, 1);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: `${parentAuthor.actorUri}/inbox`, uri: 'ftp://remote.example/actor' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    await sendLocalPostCreate(reply.id);
    assert.equal(fixture.calls.length, 1);
  });

  test('UNRESPONSIVE와 SUSPENDED Parent는 모두 제외한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const unresponsive = await createRemoteActor({
      handle: 'unresponsive-parent',
      instanceState: InstanceState.UNRESPONSIVE,
    });
    const suspended = await createRemoteActor({
      handle: 'suspended-parent',
      instanceState: InstanceState.SUSPENDED,
    });
    const unresponsiveReply = await createPost(author.id, {
      replyParentId: (await createPost(unresponsive.profile.id)).id,
    });
    const suspendedReply = await createPost(author.id, {
      replyParentId: (await createPost(suspended.profile.id)).id,
    });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(unresponsiveReply.id);
    await sendLocalPostCreate(suspendedReply.id);

    assert.equal(fixture.calls.length, 0);
  });

  test('followers expansion은 Active remote actor만 유지한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const active = await createRemoteActor({ handle: 'active-follower' });
    const unresponsive = await createRemoteActor({
      handle: 'unresponsive-follower',
      instanceState: InstanceState.UNRESPONSIVE,
    });
    const suspended = await createRemoteActor({
      handle: 'suspended-follower',
      instanceState: InstanceState.SUSPENDED,
    });
    const disabled = await createRemoteActor({ handle: 'disabled-follower' });
    const invalidInbox = await createRemoteActor({ handle: 'invalid-inbox-follower' });
    const localFollower = await createProfile({ kind: InstanceKind.LOCAL });
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, disabled.profile.id));
    await db
      .update(ActivityPubActors)
      .set({ inboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, invalidInbox.profile.id));
    await db.insert(ProfileFollows).values(
      [
        active.profile.id,
        unresponsive.profile.id,
        suspended.profile.id,
        disabled.profile.id,
        invalidInbox.profile.id,
        localFollower.id,
      ].map((followerProfileId) => ({
        followeeProfileId: author.id,
        followerProfileId,
      })),
    );
    const rootPost = await createPost(author.id);
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(rootPost.id);

    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(
      fixture.calls[0]?.recipients.map((recipient) => recipient.id?.href),
      [active.actorUri],
    );
  });

  test('Content 없는 Repost와 Direct Post는 Local Note lifecycle에서 제외한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const source = await createPost(author.id);
    const repost = await db
      .insert(Posts)
      .values({
        profileId: author.id,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    const directPost = await createPost(author.id, { visibility: PostVisibility.DIRECT });
    const createContext = mock.method(localOutboundFederation, 'createContext');

    await sendLocalPostCreate(repost.id);
    await sendLocalPostCreate(directPost.id);
    await db
      .update(Posts)
      .set({ deletedAt: Temporal.Instant.from('2026-07-28T02:00:00Z'), state: PostState.DELETED })
      .where(inArray(Posts.id, [repost.id, directPost.id]));
    await sendLocalPostDelete(repost.id);
    await sendLocalPostDelete(directPost.id);

    assert.equal(createContext.mock.callCount(), 0);
  });

  test('Delete가 tombstone 뒤 같은 Note·activity identity를 반복 사용한다', async () => {
    const { canonicalOrigin: authorOrigin, id: authorInstanceId } = await createLocalInstance();
    const author = await createProfile({ instanceId: authorInstanceId });
    const parentAuthor = await createRemoteActor({ handle: 'parent' });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: parentAuthor.profile.id,
    });
    const parent = await createPost(parentAuthor.profile.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const deletedAt = Temporal.Instant.from('2026-07-28T01:00:00Z');
    await db
      .update(Posts)
      .set({ deletedAt, state: PostState.DELETED })
      .where(eq(Posts.id, reply.id));
    const actualContext = localOutboundFederation.createContext(new URL(authorOrigin), {
      localInstanceId: authorInstanceId,
    });
    assert.equal(actualContext.canonicalOrigin, authorOrigin);
    assert.equal(actualContext.getActorUri(author.id).origin, authorOrigin);
    const fixture = createContextFixture(authorOrigin);
    const createContext = mock.method(
      localOutboundFederation,
      'createContext',
      (origin: URL, data: { readonly localInstanceId: string }) => {
        assert.equal(origin.href, `${authorOrigin}/`);
        assert.equal(data.localInstanceId, authorInstanceId);
        return fixture.context;
      },
    );

    await sendLocalPostDelete(reply.id);
    await sendLocalPostDelete(reply.id);

    assert.equal(createContext.mock.callCount(), 2);
    assert.equal(fixture.calls.length, 2);
    for (const call of fixture.calls) {
      assert.ok(call.activity instanceof Delete);
      assert.equal(call.activity.id?.href, `${authorOrigin}/ap/note/${reply.id}#delete`);
      assert.equal(call.activity.objectId?.href, `${authorOrigin}/ap/note/${reply.id}`);
      assert.equal(call.activity.published?.toString(), deletedAt.toString());
      assert.deepEqual(call.options, { preferSharedInbox: true });
      assert.deepEqual(
        call.recipients.map((recipient) => recipient.id?.href),
        [parentAuthor.actorUri],
      );
    }
  });
});

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly preferSharedInbox: boolean };
  readonly recipients: Recipient[];
  readonly sender: { readonly identifier: string };
}

const createContextFixture = (canonicalOrigin = publicOrigin) => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, canonicalOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipients: Recipient | Recipient[],
      activity: Activity,
      options: { preferSharedInbox: boolean },
    ) => {
      calls.push({
        activity,
        options,
        recipients: Array.isArray(recipients) ? recipients : [recipients],
        sender,
      });
    },
  } as Context<void>;
  return { calls, context };
};

const createLocalInstance = async () => {
  const domain = `${crypto.randomUUID()}.local.example`;
  const canonicalOrigin = `https://${domain}`;
  const instance = await db
    .insert(Instances)
    .values({ canonicalOrigin, domain, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  testInstanceIds.push(instance.id);
  return { canonicalOrigin, id: instance.id };
};

const createProfile = async ({
  handle = `profile-${crypto.randomUUID()}`,
  instanceId,
  kind = InstanceKind.ACTIVITYPUB,
}: {
  handle?: string;
  instanceId?: string;
  kind?: InstanceKind;
}) => {
  const resolvedInstanceId =
    instanceId ??
    (kind === InstanceKind.LOCAL
      ? localInstanceId
      : await db
          .insert(Instances)
          .values({
            domain: `${crypto.randomUUID()}.example`,
            kind,
            state: InstanceState.ACTIVE,
          })
          .returning({ id: Instances.id })
          .then(firstOrThrow)
          .then(({ id }) => {
            testInstanceIds.push(id);
            return id;
          }));
  assert.ok(resolvedInstanceId);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: resolvedInstanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.push(profile.id);
  return profile;
};

const createRemoteActor = async ({
  handle,
  instanceState = InstanceState.ACTIVE,
  sharedInbox = false,
}: {
  handle: string;
  instanceState?: InstanceState;
  sharedInbox?: boolean;
}) => {
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${crypto.randomUUID()}.remote.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  testInstanceIds.push(instance.id);
  const profile = await createProfile({ handle, instanceId: instance.id });
  const actorUri = `https://${instance.domain}/users/${handle}`;
  const sharedInboxUri = sharedInbox ? `https://${instance.domain}/inbox` : null;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${actorUri}/inbox`,
    profileId: profile.id,
    sharedInboxUri,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  return { actorUri, profile, sharedInboxUri };
};

const createPost = async (
  profileId: string,
  {
    replyParentId = null,
    visibility = PostVisibility.PUBLIC,
  }: { replyParentId?: string | null; visibility?: PostVisibility } = {},
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, replyParentId, state: PostState.ACTIVE, visibility })
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
    await db.update(Posts).set({ currentContentId: null }).where(inArray(Posts.id, postIds));
    await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
    await db.delete(Posts).where(inArray(Posts.id, postIds));
  }
  await db.delete(Profiles).where(inArray(Profiles.id, testProfileIds));
  if (testInstanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, testInstanceIds));
  }
  testInstanceIds = [];
  testProfileIds = [];
};
