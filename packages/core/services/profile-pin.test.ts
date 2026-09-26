import assert from 'node:assert/strict';
import { after, test } from 'node:test';
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
import { pinProfilePost, unpinProfilePost } from './profile-pin';

after(async () => {
  await pg.end();
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
  const repeated = await pinProfilePost({ profileId: profile.id, postId: first.id });
  const appended = await pinProfilePost({ profileId: profile.id, postId: second.id });

  assert.equal(created.changed, true);
  assert.deepEqual(
    created.profilePins.map(({ postId }) => postId),
    [first.id],
  );
  assert.equal(repeated.changed, false);
  assert.deepEqual(
    repeated.profilePins.map(({ postId }) => postId),
    [first.id],
  );
  assert.equal(appended.changed, true);
  assert.deepEqual(
    appended.profilePins.map(({ postId }) => postId).sort(),
    [first.id, second.id].sort(),
  );
  assert.deepEqual(
    appended.profilePins.map(({ id }) => id),
    [...appended.profilePins].map(({ id }) => id).sort(),
  );
  assert.equal(
    (await pinProfilePost({ profileId: otherProfile.id, postId: otherPost.id })).changed,
    true,
  );
  assert.deepEqual(await loadPins(profile.id), appended.profilePins);
});

test('concurrent new pins do not expose a profile order collision', async () => {
  const { profile } = await createFixture();
  const first = await createPost(profile.id);
  const second = await createPost(profile.id);
  const third = await createPost(profile.id);
  const lockSession = await pg.reserve();
  let lockHeld = false;
  let triggerInstalled = false;
  let pins: Promise<Awaited<ReturnType<typeof pinProfilePost>>>[] = [];

  try {
    await lockSession`SELECT pg_advisory_lock(973, 2)`;
    lockHeld = true;
    await pg.unsafe(`
      CREATE FUNCTION block_profile_pinned_post_insert() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        PERFORM pg_advisory_xact_lock(973, 2);
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER block_profile_pinned_post_insert
      BEFORE INSERT ON profile_pinned_post
      FOR EACH ROW EXECUTE FUNCTION block_profile_pinned_post_insert();
    `);
    triggerInstalled = true;

    pins = [
      pinProfilePost({ profileId: profile.id, postId: first.id }),
      pinProfilePost({ profileId: profile.id, postId: second.id }),
      pinProfilePost({ profileId: profile.id, postId: third.id }),
    ];

    let insertsBlocked = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [lock] = await pg<{ waiting: number }[]>`
        SELECT count(*)::integer AS waiting
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 973
          AND objid = 2
      `;
      if ((lock?.waiting ?? 0) === 3) {
        insertsBlocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(insertsBlocked, true, 'pins did not reach the INSERT barrier');

    await lockSession`SELECT pg_advisory_unlock(973, 2)`;
    lockHeld = false;

    const results = await Promise.all(pins);
    assert.ok(results.every(({ changed }) => changed));
    const stored = await loadPins(profile.id);
    assert.deepEqual(
      stored.map(({ id }) => id),
      [...stored].map(({ id }) => id).sort(),
    );
    assert.deepEqual(
      stored.map(({ postId }) => postId).sort(),
      [first.id, second.id, third.id].sort(),
    );
  } finally {
    if (lockHeld) {
      await lockSession`SELECT pg_advisory_unlock(973, 2)`;
    }
    await Promise.allSettled(pins);
    if (triggerInstalled) {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS block_profile_pinned_post_insert ON profile_pinned_post;
        DROP FUNCTION IF EXISTS block_profile_pinned_post_insert();
      `);
    }
    lockSession.release();
  }
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
    removed.profilePins.map(({ postId }) => postId),
    [second.id],
  );
  assert.equal(repeated.changed, false);
  assert.deepEqual(
    repeated.profilePins.map(({ postId }) => postId),
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
