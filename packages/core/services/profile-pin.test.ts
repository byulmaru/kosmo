import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg, PostContents, Posts, ProfilePins, Profiles } from '../db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { pinProfilePost, replaceCurrentProfilePin, unpinProfilePost } from './profile-pin';

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
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    content?: boolean;
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
    .from(ProfilePins)
    .where(eq(ProfilePins.profileId, profileId))
    .orderBy(asc(ProfilePins.orderKey), asc(ProfilePins.id));

const createFixture = async () => {
  const instance = await createInstance();
  const profile = await createProfile(instance.id);
  return { instance, profile };
};

test('eligible posts append in order and pinning the same post is a no-op', async () => {
  const { profile } = await createFixture();
  const first = await createPost(profile.id);
  const second = await createPost(profile.id);

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
    appended.profilePins.map(({ postId }) => postId),
    [first.id, second.id],
  );
  assert.deepEqual(await loadPins(profile.id), appended.profilePins);
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

test('replacement rejects a stale current post without changing storage', async () => {
  const { profile } = await createFixture();
  const current = await createPost(profile.id);
  const next = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: current.id });

  await assert.rejects(
    replaceCurrentProfilePin({
      expectedCurrentPostId: crypto.randomUUID(),
      newPostId: next.id,
      profileId: profile.id,
    }),
    (error: unknown) => error instanceof ConflictError && error.field === 'expectedCurrentPostId',
  );
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [current.id],
  );
});

test('replacement uses the first visible pin when an earlier pin is hidden', async () => {
  const { profile } = await createFixture();
  const hidden = await createPost(profile.id);
  const current = await createPost(profile.id);
  const replacement = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: hidden.id });
  await pinProfilePost({ profileId: profile.id, postId: current.id });
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, hidden.id));

  await assert.rejects(
    replaceCurrentProfilePin({
      expectedCurrentPostId: hidden.id,
      newPostId: replacement.id,
      profileId: profile.id,
    }),
    (error: unknown) => error instanceof ConflictError && error.field === 'expectedCurrentPostId',
  );
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [hidden.id, current.id],
  );

  const result = await replaceCurrentProfilePin({
    expectedCurrentPostId: current.id,
    newPostId: replacement.id,
    profileId: profile.id,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.profilePins.map(({ postId }) => postId),
    [hidden.id, replacement.id],
  );
  assert.deepEqual(
    (await loadPins(profile.id)).map(({ postId }) => postId),
    [hidden.id, replacement.id],
  );
});

test('replacement moves an already-pinned target to the current position', async () => {
  const { profile } = await createFixture();
  const a = await createPost(profile.id);
  const c = await createPost(profile.id);
  const b = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: a.id });
  await pinProfilePost({ profileId: profile.id, postId: c.id });
  await pinProfilePost({ profileId: profile.id, postId: b.id });

  const result = await replaceCurrentProfilePin({
    expectedCurrentPostId: a.id,
    newPostId: b.id,
    profileId: profile.id,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.profilePins.map(({ postId }) => postId),
    [b.id, c.id],
  );
});

test('replacement preserves a newer generation when two requests race on one expected row', async () => {
  const { profile } = await createFixture();
  const current = await createPost(profile.id);
  const firstTarget = await createPost(profile.id);
  const secondTarget = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: current.id });

  const results = await Promise.allSettled([
    replaceCurrentProfilePin({
      expectedCurrentPostId: current.id,
      newPostId: firstTarget.id,
      profileId: profile.id,
    }),
    replaceCurrentProfilePin({
      expectedCurrentPostId: current.id,
      newPostId: secondTarget.id,
      profileId: profile.id,
    }),
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  const rejected = results.find(({ status }) => status === 'rejected');
  assert.equal(rejected?.status, 'rejected');
  if (rejected?.status === 'rejected') {
    assert.ok(
      rejected.reason instanceof ConflictError && rejected.reason.field === 'expectedCurrentPostId',
    );
  }
  assert.equal((await loadPins(profile.id)).length, 1);
  assert.ok([firstTarget.id, secondTarget.id].includes((await loadPins(profile.id))[0]!.postId));
});

test('unpinning the expected current post races with replacement without raw errors', async () => {
  const { profile } = await createFixture();
  const current = await createPost(profile.id);
  const target = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: current.id });

  const results = await Promise.allSettled([
    unpinProfilePost({ profileId: profile.id, postId: current.id }),
    replaceCurrentProfilePin({
      expectedCurrentPostId: current.id,
      newPostId: target.id,
      profileId: profile.id,
    }),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      assert.ok(
        result.reason instanceof ConflictError && result.reason.field === 'expectedCurrentPostId',
      );
    }
  }
  const pins = await loadPins(profile.id);
  assert.ok(pins.length <= 1);
  assert.ok(pins.every(({ postId }) => postId === target.id));
});

test('unpinning the replacement target races with replacement without raw errors', async () => {
  const { profile } = await createFixture();
  const current = await createPost(profile.id);
  const target = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: current.id });

  const results = await Promise.allSettled([
    unpinProfilePost({ profileId: profile.id, postId: target.id }),
    replaceCurrentProfilePin({
      expectedCurrentPostId: current.id,
      newPostId: target.id,
      profileId: profile.id,
    }),
  ]);

  assert.ok(results.every(({ status }) => status === 'fulfilled'));
  const pins = await loadPins(profile.id);
  assert.ok(pins.length <= 1);
  assert.ok(pins.every(({ postId }) => postId === target.id));
});

test('pin and replacement races do not expose a unique violation', async () => {
  const { profile } = await createFixture();
  const current = await createPost(profile.id);
  const target = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: current.id });

  const lockSession = await pg.reserve();
  let lockHeld = false;
  let triggerInstalled = false;
  let replacement: Promise<Awaited<ReturnType<typeof replaceCurrentProfilePin>>> | undefined;
  let pin: Promise<Awaited<ReturnType<typeof pinProfilePost>>> | undefined;

  try {
    await lockSession`SELECT pg_advisory_lock(973, 1)`;
    lockHeld = true;
    await pg.unsafe(`
      CREATE FUNCTION block_profile_pin_update() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        PERFORM pg_advisory_xact_lock(973, 1);
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER block_profile_pin_update
      BEFORE UPDATE OF post_id ON profile_pin
      FOR EACH ROW EXECUTE FUNCTION block_profile_pin_update();
    `);
    triggerInstalled = true;

    replacement = replaceCurrentProfilePin({
      expectedCurrentPostId: current.id,
      newPostId: target.id,
      profileId: profile.id,
    });

    let updateBlocked = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [lock] = await pg<{ waiting: number }[]>`
        SELECT count(*)::integer AS waiting
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 973
          AND objid = 1
      `;
      if ((lock?.waiting ?? 0) > 0) {
        updateBlocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(updateBlocked, true, 'replacement did not reach the UPDATE barrier');

    pin = pinProfilePost({ profileId: profile.id, postId: target.id });
    const pinResult = await pin;
    assert.equal(pinResult.changed, true);

    await lockSession`SELECT pg_advisory_unlock(973, 1)`;
    lockHeld = false;

    const [replacementResult] = await Promise.allSettled([replacement]);
    assert.equal(replacementResult.status, 'fulfilled');
    if (replacementResult.status === 'fulfilled') {
      assert.equal(replacementResult.value.changed, true);
      assert.deepEqual(
        replacementResult.value.profilePins.map(({ postId }) => postId),
        [target.id],
      );
    }
    assert.deepEqual(
      (await loadPins(profile.id)).map(({ postId }) => postId),
      [target.id],
    );
  } finally {
    if (lockHeld) {
      await lockSession`SELECT pg_advisory_unlock(973, 1)`;
    }
    if (replacement) {
      await Promise.allSettled([replacement]);
    }
    if (pin) {
      await Promise.allSettled([pin]);
    }
    if (triggerInstalled) {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS block_profile_pin_update ON profile_pin;
        DROP FUNCTION IF EXISTS block_profile_pin_update();
      `);
    }
    lockSession.release();
  }
});

test('replacement of the current post with itself is an idempotent no-op', async () => {
  const { profile } = await createFixture();
  const current = await createPost(profile.id);
  await pinProfilePost({ profileId: profile.id, postId: current.id });

  const result = await replaceCurrentProfilePin({
    expectedCurrentPostId: current.id,
    newPostId: current.id,
    profileId: profile.id,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(
    result.profilePins.map(({ postId }) => postId),
    [current.id],
  );
});

test('replacement requires an existing current pin', async () => {
  const { profile } = await createFixture();
  const next = await createPost(profile.id);

  await assert.rejects(
    replaceCurrentProfilePin({
      expectedCurrentPostId: crypto.randomUUID(),
      newPostId: next.id,
      profileId: profile.id,
    }),
    (error: unknown) => error instanceof ConflictError && error.field === 'expectedCurrentPostId',
  );
});
