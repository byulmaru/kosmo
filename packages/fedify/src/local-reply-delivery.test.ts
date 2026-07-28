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
import type { federation as Federation } from './federation';
import type * as LocalReplyDelivery from './local-reply-delivery';

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
let Profiles: typeof CoreDb.Profiles;
let sendLocalReplyCreate: typeof LocalReplyDelivery.sendLocalReplyCreate;
let sendLocalReplyDelete: typeof LocalReplyDelivery.sendLocalReplyDelete;
let testInstanceIds: string[] = [];
let testProfileIds: string[] = [];

describe('ActivityPub Local Reply delivery', () => {
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
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ federation } = await import('./federation'));
    ({ sendLocalReplyCreate, sendLocalReplyDelete } = await import('./local-reply-delivery'));
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
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'parent', sharedInbox: true });
    const parent = await createPost(parentAuthor.profile.id);
    const parentUri = new URL('https://remote.example/notes/parent');
    await db.insert(ActivityPubPosts).values({
      postId: parent.id,
      receivedAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
      uri: parentUri.href,
    });
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendLocalReplyCreate(reply.id);
    await sendLocalReplyCreate(reply.id);

    assert.equal(fixture.calls.length, 2);
    for (const call of fixture.calls) {
      assert.ok(call.activity instanceof Create);
      assert.equal(call.activity.id?.href, `${publicOrigin}/ap/note/${reply.id}#create`);
      assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${author.id}`);
      const object = await call.activity.getObject();
      assert.ok(object instanceof Note);
      assert.equal(object.id?.href, `${publicOrigin}/ap/note/${reply.id}`);
      assert.equal(object.replyTargetId?.href, parentUri.href);
      assert.deepEqual(call.sender, { identifier: author.id });
      assert.deepEqual(call.options, {
        orderingKey: `${publicOrigin}/ap/note/${reply.id}`,
        preferSharedInbox: true,
      });
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
    mock.method(federation, 'createContext', () => fixture.context);

    await sendLocalReplyCreate(publicReply.id);
    await sendLocalReplyCreate(unlistedReply.id);
    await sendLocalReplyCreate(followersReply.id);
    await sendLocalReplyCreate(directReply.id);
    await sendLocalReplyCreate(rootPost.id);

    assert.equal(fixture.calls.length, 2);
    assert.ok(
      fixture.calls.every((call) => call.recipients[0]?.id?.href === parentAuthor.actorUri),
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
    mock.method(federation, 'createContext', () => fixture.context);

    await sendLocalReplyCreate(reply.id);

    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0]?.recipients[0]?.inboxId?.href, `${parentAuthor.actorUri}/inbox`);
    assert.equal(fixture.calls[0]?.recipients[0]?.endpoints, null);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    await sendLocalReplyCreate(reply.id);
    assert.equal(fixture.calls.length, 1);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: `${parentAuthor.actorUri}/inbox`, uri: 'ftp://remote.example/actor' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    await sendLocalReplyCreate(reply.id);
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
    mock.method(federation, 'createContext', () => fixture.context);

    await sendLocalReplyCreate(unresponsiveReply.id);
    await sendLocalReplyCreate(suspendedReply.id);

    assert.equal(fixture.calls.length, 0);
  });

  test('Delete가 tombstone 뒤 같은 Note·activity identity와 Create ordering domain을 반복 사용한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'parent' });
    const parent = await createPost(parentAuthor.profile.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const deletedAt = Temporal.Instant.from('2026-07-28T01:00:00Z');
    await db
      .update(Posts)
      .set({ deletedAt, state: PostState.DELETED })
      .where(eq(Posts.id, reply.id));
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendLocalReplyDelete(reply.id);
    await sendLocalReplyDelete(reply.id);

    assert.equal(fixture.calls.length, 2);
    for (const call of fixture.calls) {
      assert.ok(call.activity instanceof Delete);
      assert.equal(call.activity.id?.href, `${publicOrigin}/ap/note/${reply.id}#delete`);
      assert.equal(call.activity.objectId?.href, `${publicOrigin}/ap/note/${reply.id}`);
      assert.equal(call.activity.published?.toString(), deletedAt.toString());
      assert.equal(call.options.orderingKey, `${publicOrigin}/ap/note/${reply.id}`);
      assert.deepEqual(
        call.recipients.map((recipient) => recipient.id?.href),
        [parentAuthor.actorUri],
      );
    }
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
      recipients: Recipient | Recipient[],
      activity: Activity,
      options: { orderingKey: string; preferSharedInbox: boolean },
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
