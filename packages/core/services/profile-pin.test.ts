import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { after, afterEach, mock, test } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import { getFraciErrorCode } from 'fraci';
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
import { ConflictError, NotFoundError } from '../error';
import { temporalClient } from '../temporal/client';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import {
  generateProfilePinKey,
  pinProfilePost,
  reorderProfilePost,
  unpinProfilePost,
} from './profile-pin';
import type { ProfilePinOrderKey } from '../db';

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
        .values({ document: { version: 1, summary: null, body: { type: 'doc', content: [] } } })
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

const orderedPins = (profileId: string) =>
  db
    .select({
      id: ProfilePinnedPosts.id,
      postId: ProfilePinnedPosts.postId,
      key: ProfilePinnedPosts.orderKey,
    })
    .from(ProfilePinnedPosts)
    .where(eq(ProfilePinnedPosts.profileId, profileId))
    .orderBy(asc(ProfilePinnedPosts.orderKey), asc(ProfilePinnedPosts.id));

const insertPinsInOrder = async (profileId: string, postIds: readonly string[]) => {
  let previous: ProfilePinOrderKey | null = null;
  const pins = postIds.map((postId) => {
    const orderKey = generateProfilePinKey(previous, null);
    previous = orderKey;
    return { orderKey, postId, profileId };
  });
  await db.insert(ProfilePinnedPosts).values(pins);
};

test('generated profile pin keys use jitter and stay between their bounds', () => {
  const skips = [0, 0, 17, 18];
  const randomInt = mock.method(nodeCrypto, 'randomInt', () => skips.shift() ?? 0);
  const first = generateProfilePinKey(null, null);
  const last = generateProfilePinKey(first, null);
  const firstSnapshot = Buffer.from(first);
  const lastSnapshot = Buffer.from(last);
  const lowerJitter = generateProfilePinKey(first, last);
  const higherJitter = generateProfilePinKey(first, last);

  assert.ok(Buffer.compare(first, lowerJitter) < 0);
  assert.ok(Buffer.compare(lowerJitter, last) < 0);
  assert.ok(Buffer.compare(first, higherJitter) < 0);
  assert.ok(Buffer.compare(higherJitter, last) < 0);
  assert.deepEqual(first, firstSnapshot);
  assert.deepEqual(last, lastSnapshot);
  assert.notDeepEqual(lowerJitter, higherJitter);
  assert.equal(randomInt.mock.callCount(), 4);
  assert.ok(randomInt.mock.calls.every((call) => call.arguments[0] === 256));
});

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

test('pin and reorder propagate unique violations without retrying', async () => {
  const failure = Object.assign(new Error('Injected database failure'), { code: '23505' });
  const transaction = mock.method(db, 'transaction', async () => {
    throw failure;
  });
  const profileId = nodeCrypto.randomUUID();
  const postId = nodeCrypto.randomUUID();

  await assert.rejects(
    pinProfilePost({ profileId, postId }),
    (error: unknown) => error === failure,
  );
  await assert.rejects(
    reorderProfilePost({ profileId, postId }),
    (error: unknown) => error === failure,
  );

  assert.equal(transaction.mock.callCount(), 2);
  assert.ok(transaction.mock.calls.every((call) => call.arguments.length === 1));
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

test('reorder preserves hidden memberships and idempotency', async () => {
  const { profile } = await createFixture();
  const posts = await Promise.all(Array.from({ length: 4 }, () => createPost(profile.id)));
  await insertPinsInOrder(
    profile.id,
    posts.map((post) => post.id),
  );
  const original = await orderedPins(profile.id);
  const [a, hidden, b, c] = original;
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, hidden.postId));
  assert.equal(
    (await reorderProfilePost({ profileId: profile.id, postId: c.postId, beforePostId: a.postId }))
      .changed,
    true,
  );
  assert.deepEqual(
    (await orderedPins(profile.id)).map((row) => row.postId),
    [c.postId, a.postId, hidden.postId, b.postId],
  );
  assert.deepEqual(
    (await orderedPins(profile.id)).map((row) => row.id).sort(),
    original.map((row) => row.id).sort(),
  );
  assert.equal(
    (await reorderProfilePost({ profileId: profile.id, postId: c.postId, beforePostId: a.postId }))
      .changed,
    false,
  );
  await assert.rejects(
    reorderProfilePost({ profileId: profile.id, postId: c.postId, beforePostId: c.postId }),
    ConflictError,
  );
  await reorderProfilePost({ profileId: profile.id, postId: c.postId });
  assert.deepEqual(
    (await orderedPins(profile.id)).map((row) => row.postId),
    original.map((row) => row.postId),
  );
  assert.equal(
    (await reorderProfilePost({ profileId: profile.id, postId: c.postId })).changed,
    false,
  );
  const fresh = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: fresh.id });
  assert.equal((await orderedPins(profile.id)).at(-1)?.postId, fresh.id);
  const before = await orderedPins(profile.id);
  const notPinned = await createPost(profile.id);
  await assert.rejects(
    reorderProfilePost({ profileId: profile.id, postId: c.postId, beforePostId: notPinned.id }),
    (error: unknown) => error instanceof NotFoundError,
  );
  await assert.rejects(
    reorderProfilePost({ profileId: profile.id, postId: hidden.postId }),
    NotFoundError,
  );
  await assert.rejects(
    reorderProfilePost({
      profileId: profile.id,
      postId: c.postId,
      beforePostId: crypto.randomUUID(),
    }),
    NotFoundError,
  );
  assert.deepEqual(await orderedPins(profile.id), before);
});

test('PostgreSQL round trips binary order keys and enforces per-profile uniqueness', async () => {
  const { profile } = await createFixture();
  const posts = await Promise.all(Array.from({ length: 4 }, () => createPost(profile.id)));
  const first = generateProfilePinKey(null, null);
  const last = generateProfilePinKey(first, null);
  const middle = generateProfilePinKey(first, last);
  const keys = [first, middle, last];
  await db.insert(ProfilePinnedPosts).values(
    keys.map((orderKey, index) => ({
      orderKey,
      postId: posts[index]!.id,
      profileId: profile.id,
    })),
  );
  assert.deepEqual(
    (await orderedPins(profile.id)).map((row) => row.key),
    keys,
  );
  await assert.rejects(
    db
      .insert(ProfilePinnedPosts)
      .values({ profileId: profile.id, postId: posts[3]!.id, orderKey: first }),
  );
  assert.equal((await orderedPins(profile.id)).length, 3);
});

test('MAX_LENGTH_EXCEEDED leaves the persisted pin order unchanged', async () => {
  mock.method(nodeCrypto, 'randomInt', () => 0);
  const { profile } = await createFixture();
  const [leftPost, rightPost, targetPost] = await Promise.all(
    Array.from({ length: 3 }, () => createPost(profile.id)),
  );
  assert.ok(leftPost);
  assert.ok(rightPost);
  assert.ok(targetPost);

  let leftKey = generateProfilePinKey(null, null);
  const rightKey = generateProfilePinKey(leftKey, null);
  let exhausted = false;
  for (let attempt = 0; attempt < 1024; attempt++) {
    try {
      leftKey = generateProfilePinKey(leftKey, rightKey);
    } catch (error) {
      assert.equal(getFraciErrorCode(error), 'MAX_LENGTH_EXCEEDED');
      exhausted = true;
      break;
    }
  }
  assert.ok(exhausted);
  const targetKey = generateProfilePinKey(rightKey, null);
  await db.insert(ProfilePinnedPosts).values([
    { orderKey: leftKey, postId: leftPost.id, profileId: profile.id },
    { orderKey: rightKey, postId: rightPost.id, profileId: profile.id },
    { orderKey: targetKey, postId: targetPost.id, profileId: profile.id },
  ]);
  const before = await orderedPins(profile.id);
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  await assert.rejects(
    reorderProfilePost({
      profileId: profile.id,
      postId: targetPost.id,
      beforePostId: rightPost.id,
    }),
    (error: unknown) => getFraciErrorCode(error) === 'MAX_LENGTH_EXCEEDED',
  );

  assert.deepEqual(await orderedPins(profile.id), before);
  assert.equal(start.mock.callCount(), 0);
});

test('concurrent reorder, append and removal preserve memberships', async () => {
  const { profile } = await createFixture();
  const posts = await Promise.all(Array.from({ length: 4 }, () => createPost(profile.id)));
  for (const post of posts.slice(0, 3)) {
    await pinProfilePost({ profileId: profile.id, postId: post.id });
  }
  await Promise.all([
    reorderProfilePost({ profileId: profile.id, postId: posts[2].id, beforePostId: posts[0].id }),
    pinProfilePost({ profileId: profile.id, postId: posts[3].id }),
    unpinProfilePost({ profileId: profile.id, postId: posts[1].id }),
  ]);
  assert.deepEqual(
    (await orderedPins(profile.id)).map((row) => row.postId).sort(),
    [posts[0].id, posts[2].id, posts[3].id].sort(),
  );
});

test('only changed reorder commits start effects, and failed effect keeps saved order', async () => {
  const { profile } = await createFixture();
  const posts = await Promise.all([createPost(profile.id), createPost(profile.id)]);
  for (const post of posts) {
    await pinProfilePost({ profileId: profile.id, postId: post.id });
  }
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
  const input = { profileId: profile.id, postId: posts[1].id, beforePostId: posts[0].id };
  assert.equal((await reorderProfilePost(input)).changed, true);
  assert.equal((await reorderProfilePost(input)).changed, false);
  assert.equal(start.mock.callCount(), 1);
  start.mock.mockImplementation(async () => {
    throw new Error('unavailable');
  });
  mock.method(console, 'error', () => undefined);
  assert.equal(
    (await reorderProfilePost({ profileId: profile.id, postId: posts[1].id })).changed,
    true,
  );
  assert.deepEqual(
    (await orderedPins(profile.id)).map((row) => row.postId),
    posts.map((post) => post.id),
  );
});

test('reorder rejects Remote and unavailable profiles without altering their pins', async () => {
  for (const kind of [InstanceKind.LOCAL, InstanceKind.ACTIVITYPUB]) {
    const instance = await createInstance(kind);
    const profile = await createProfile(
      instance.id,
      kind === InstanceKind.LOCAL ? ProfileState.DISABLED : ProfileState.ACTIVE,
    );
    const post = await createPost(profile.id);
    await insertPinsInOrder(profile.id, [post.id]);
    const before = await orderedPins(profile.id);
    await assert.rejects(
      reorderProfilePost({ profileId: profile.id, postId: post.id }),
      NotFoundError,
    );
    assert.deepEqual(await orderedPins(profile.id), before);
  }
});
