import assert from 'node:assert/strict';
import { after, afterEach, mock, test } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  Posts,
  ProfilePinnedPosts,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError } from '../error';
import { temporalClient } from '../temporal/client';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import { pinProfilePost, unpinProfilePost } from './profile-pin';

after(async () => {
  await pg.end();
});

afterEach(() => {
  mock.restoreAll();
});

const createInstance = async (
  kind: InstanceKind = InstanceKind.LOCAL,
  state: InstanceState = InstanceState.ACTIVE,
) =>
  db
    .insert(Instances)
    .values({ domain: `${crypto.randomUUID()}.example`, kind, state })
    .returning()
    .then(firstOrThrow);

const createProfile = async (instanceId: string, state: ProfileState = ProfileState.ACTIVE) => {
  const suffix = crypto.randomUUID();
  return db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId,
      normalizedHandle: suffix,
      state,
    })
    .returning()
    .then(firstOrThrow);
};

const createPost = async (
  profileId: string,
  {
    content = true,
    repostSourceId,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    content?: boolean;
    repostSourceId?: string;
    state?: PostState;
    visibility?: PostVisibility;
  } = {},
) => {
  const contentRow = content
    ? await db
        .insert(PostContents)
        .values({ document: { type: 'doc', content: [] } })
        .returning()
        .then(firstOrThrow)
    : undefined;
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: contentRow?.id,
      profileId,
      repostSourceId,
      state,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
  if (contentRow) {
    await db
      .update(PostContents)
      .set({ postId: post.id })
      .where(eq(PostContents.id, contentRow.id));
  }
  return post;
};

const loadPins = (profileId: string) =>
  db
    .select()
    .from(ProfilePinnedPosts)
    .where(eq(ProfilePinnedPosts.profileId, profileId))
    .orderBy(asc(ProfilePinnedPosts.id));

const createFixture = async () => {
  const instance = await createInstance();
  const profile = await createProfile(instance.id);
  return { instance, profile };
};

test('eligible posts append per profile and pinning the same post is a no-op', async () => {
  const { profile } = await createFixture();
  const first = await createPost(profile.id);
  const second = await createPost(profile.id);
  const { profile: otherProfile } = await createFixture();
  const otherPost = await createPost(otherProfile.id);

  const created = await pinProfilePost({ profileId: profile.id, postId: first.id });
  assert.equal(created.changed, true);
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [first.id],
  );

  const repeated = await pinProfilePost({ profileId: profile.id, postId: first.id });
  assert.equal(repeated.changed, false);
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [first.id],
  );

  const appended = await pinProfilePost({ profileId: profile.id, postId: second.id });
  assert.equal(appended.changed, true);
  const appendedPins = await loadPins(profile.id);

  assert.deepEqual(appendedPins.map(({ postId }) => postId).sort(), [first.id, second.id].sort());
  assert.equal(
    (await pinProfilePost({ profileId: otherProfile.id, postId: otherPost.id })).changed,
    true,
  );
  assert.deepEqual(await loadPins(profile.id), appendedPins);
  assert.deepEqual(
    (await loadPins(otherProfile.id)).map(({ postId }) => postId),
    [otherPost.id],
  );
});

test('unpin removes only the exact present post and absent unpin is idempotent', async () => {
  const { profile } = await createFixture();
  const first = await createPost(profile.id);
  const second = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: first.id });
  await pinProfilePost({ profileId: profile.id, postId: second.id });

  const removed = await unpinProfilePost({ profileId: profile.id, postId: first.id });
  const repeated = await unpinProfilePost({ profileId: profile.id, postId: first.id });

  assert.equal(removed.changed, true);
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [second.id],
  );
  assert.equal(repeated.changed, false);
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [second.id],
  );
});

test('pin rejects posts outside the local active profile pin policy', async () => {
  const { profile } = await createFixture();
  const otherProfile = await createProfile(profile.instanceId);
  const foreign = await createPost(otherProfile.id);
  const noContent = await createPost(profile.id, { content: false });
  const direct = await createPost(profile.id, { visibility: PostVisibility.DIRECT });
  const deleted = await createPost(profile.id, { state: PostState.DELETED });
  const suspendedInstance = await createInstance(InstanceKind.LOCAL, InstanceState.SUSPENDED);
  const suspendedProfile = await createProfile(suspendedInstance.id);
  const suspendedPost = await createPost(suspendedProfile.id);
  const disabledProfile = await createProfile(profile.instanceId, ProfileState.DISABLED);
  const disabledPost = await createPost(disabledProfile.id);
  const suspendedProfileState = await createProfile(profile.instanceId, ProfileState.SUSPENDED);
  const suspendedProfilePost = await createPost(suspendedProfileState.id);
  const remoteInstance = await createInstance(InstanceKind.ACTIVITYPUB);
  const remoteProfile = await createProfile(remoteInstance.id);
  const remotePost = await createPost(remoteProfile.id);

  for (const postId of [
    foreign.id,
    noContent.id,
    direct.id,
    deleted.id,
    suspendedPost.id,
    disabledPost.id,
    suspendedProfilePost.id,
    remotePost.id,
  ]) {
    await assert.rejects(
      pinProfilePost({ profileId: profile.id, postId }),
      (error: unknown) => error instanceof NotFoundError,
    );
  }
});

test('pin accepts Unlisted, Followers Only, Reply, and Quote posts', async () => {
  const { profile } = await createFixture();
  const unlisted = await createPost(profile.id, { visibility: PostVisibility.UNLISTED });
  const followersOnly = await createPost(profile.id, { visibility: PostVisibility.FOLLOWERS });
  const replyParent = await createPost(profile.id);
  const reply = await createPost(profile.id);
  await db.update(Posts).set({ replyParentId: replyParent.id }).where(eq(Posts.id, reply.id));
  const quoteSource = await createPost(profile.id);
  const quote = await createPost(profile.id);
  await db.update(Posts).set({ repostSourceId: quoteSource.id }).where(eq(Posts.id, quote.id));

  for (const postId of [unlisted.id, followersOnly.id, reply.id, quote.id]) {
    const result = await pinProfilePost({ profileId: profile.id, postId });
    assert.equal(result.changed, true);
  }

  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [unlisted.id, followersOnly.id, reply.id, quote.id],
  );
});

test('changed pin and unpin start Profile Update effects once with unique update IDs', async () => {
  const { profile } = await createFixture();
  const post = await createPost(profile.id);
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  const pinned = await pinProfilePost({ profileId: profile.id, postId: post.id });
  const repeatedPin = await pinProfilePost({ profileId: profile.id, postId: post.id });
  const unpinned = await unpinProfilePost({ profileId: profile.id, postId: post.id });
  const repeatedUnpin = await unpinProfilePost({ profileId: profile.id, postId: post.id });

  assert.equal(pinned.changed, true);
  assert.equal(repeatedPin.changed, false);
  assert.equal(unpinned.changed, true);
  assert.equal(repeatedUnpin.changed, false);
  assert.equal(start.mock.callCount(), 2);

  const firstStart = start.mock.calls[0];
  const secondStart = start.mock.calls[1];
  assert.ok(firstStart);
  assert.ok(secondStart);
  assert.equal(firstStart.arguments[0], 'profileUpdateEffectsWorkflow');
  assert.equal(secondStart.arguments[0], 'profileUpdateEffectsWorkflow');
  const firstOptions = firstStart.arguments[1];
  const secondOptions = secondStart.arguments[1];
  assert.ok(firstOptions);
  assert.ok(secondOptions);
  assert.equal(firstOptions.taskQueue, KOSMO_TASK_QUEUE);
  assert.equal(secondOptions.taskQueue, KOSMO_TASK_QUEUE);
  assert.notEqual(firstOptions.workflowId, secondOptions.workflowId);
  assert.deepEqual(firstOptions.args, [
    { profileId: profile.id, updateId: firstOptions.workflowId },
  ]);
  assert.deepEqual(secondOptions.args, [
    { profileId: profile.id, updateId: secondOptions.workflowId },
  ]);
});

test('Profile Update effects start failure preserves committed pin changes', async () => {
  const { profile } = await createFixture();
  const post = await createPost(profile.id);
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    throw new Error('Temporal unavailable');
  });
  const errorLog = mock.method(console, 'error', () => undefined);

  const pinned = await pinProfilePost({ profileId: profile.id, postId: post.id });
  assert.equal(pinned.changed, true);
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [post.id],
  );

  const unpinned = await unpinProfilePost({ profileId: profile.id, postId: post.id });
  assert.equal(unpinned.changed, true);
  assert.deepEqual(await loadPins(profile.id), []);
  assert.equal(start.mock.callCount(), 2);
  assert.equal(errorLog.mock.callCount(), 2);
  assert.equal(
    errorLog.mock.calls[0]?.arguments[0],
    'Profile Update effects Workflow start failed',
  );
});

test('pin rejects inactive and suspended owner profiles', async () => {
  const instance = await createInstance();
  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    const profile = await createProfile(instance.id, state);
    const post = await createPost(profile.id);

    await assert.rejects(
      pinProfilePost({ profileId: profile.id, postId: post.id }),
      (error: unknown) => error instanceof NotFoundError,
    );
  }
});
