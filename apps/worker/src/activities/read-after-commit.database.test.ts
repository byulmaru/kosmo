import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const primaryHost = process.env.PGHOST;
if (!primaryHost) {
  throw new Error('PGHOST must be set by the isolated Worker test database');
}
process.env.PGREADHOST = primaryHost;

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}

const {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  pg,
  pgRead,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
  withPrimaryDatabase,
} = await import('@kosmo/core/db');
const {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} = await import('@kosmo/core/enums');
const { postContentDocumentFromText } = await import('@kosmo/core/post-content/server');
const { cacheHomeTimelinePage, invalidateHomeTimelines, readHomeTimelineCache } =
  await import('@kosmo/core/home-timeline/cache');
const { insertHomeTimelinePostActivity, reconcileHomeTimelineFollowChangesActivity } =
  await import('./home-timeline.js');
const { createPostActivity, generatePostIdActivity } = await import('./post-create.js');
const { reconcilePostRequestActivity } = await import('./post-request.js');
const { eq, inArray } = await import('drizzle-orm');

if (!pgRead) {
  throw new Error('PGREADHOST must create a read client for the replica snapshot test');
}

const profileIds: string[] = [];
const accountIds: string[] = [];
const instanceIds: string[] = [];
const postIds: string[] = [];
const contentIds: string[] = [];
const cachedProfileIds = new Set<string>();

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  return profile;
};

const createAuthor = async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      oidcSubject: suffix,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);

  const profile = await createProfile();
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.MEMBER,
  });
  return { account, profile };
};

const createPost = async (profileId: string, id: string) => {
  const post = await db
    .insert(Posts)
    .values({
      id,
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(post.id);

  const content = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText('Replica routing regression'),
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);
  contentIds.push(content.id);
  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
  return post;
};

const createOrderedPostIdSequence = () => {
  const timestamp = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const prefix = `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-`;
  let sequence = 0;
  return () => `${prefix}${(++sequence).toString(16).padStart(12, '0')}`;
};

const cacheHomeTimelinePageWhenReady = async ({
  profileId,
  postIds,
}: {
  readonly profileId: string;
  readonly postIds: readonly string[];
}) => {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    await cacheHomeTimelinePage({ profileId, postIds });
    if (await readHomeTimelineCache({ profileId, limit: postIds.length })) {
      return;
    }
    await delay(25);
  }
  assert.fail('Test Redis did not accept the Home timeline fixture');
};

const withStaleReplicaSnapshot = async <T>(operation: () => Promise<T>): Promise<T> => {
  const originalUnsafe = pgRead.unsafe;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  let releaseSnapshot!: () => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const holdSnapshot = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  const snapshotRun = pgRead
    .begin('isolation level repeatable read read only', async (snapshot) => {
      await snapshot.unsafe('SELECT id FROM profile LIMIT 1');
      pgRead.unsafe = ((...args: Parameters<typeof pgRead.unsafe>) =>
        snapshot.unsafe(...args)) as typeof pgRead.unsafe;
      resolveReady();
      await holdSnapshot;
    })
    .catch((error: unknown) => {
      rejectReady(error);
      throw error;
    });
  void snapshotRun.catch(() => undefined);

  try {
    await ready;
    return await operation();
  } finally {
    pgRead.unsafe = originalUnsafe;
    releaseSnapshot();
    await snapshotRun;
  }
};

after(async () => {
  try {
    if (cachedProfileIds.size > 0) {
      await invalidateHomeTimelines({ profileIds: [...cachedProfileIds] });
    }
  } finally {
    try {
      await withPrimaryDatabase(async () => {
        const relatedContentIds =
          postIds.length > 0
            ? await db
                .select({ id: PostContents.id })
                .from(PostContents)
                .where(inArray(PostContents.postId, postIds))
                .then((rows) => rows.map(({ id }) => id))
            : [];
        const cleanupContentIds = [...new Set([...contentIds, ...relatedContentIds])];
        if (postIds.length > 0) {
          await db
            .update(Posts)
            .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
            .where(inArray(Posts.id, postIds));
        }
        if (cleanupContentIds.length > 0) {
          await db
            .update(PostContents)
            .set({ postId: null })
            .where(inArray(PostContents.id, cleanupContentIds));
        }
        if (postIds.length > 0) {
          await db.delete(Posts).where(inArray(Posts.id, postIds));
        }
        if (cleanupContentIds.length > 0) {
          await db.delete(PostContents).where(inArray(PostContents.id, cleanupContentIds));
        }
        if (profileIds.length > 0) {
          await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
        }
        if (accountIds.length > 0) {
          await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
        }
        if (instanceIds.length > 0) {
          await db.delete(Instances).where(inArray(Instances.id, instanceIds));
        }
      });
    } finally {
      await Promise.all([pg.end({ timeout: 0 }), pgRead.end({ timeout: 0 })]);
    }
  }
});

test(
  'Home reconciliation applies committed Follow additions and removals while the reader snapshot remains stale',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createProfile();
    const removedFollowee = await createProfile();
    const addedFollowee = await createProfile();
    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: viewer.id, followeeProfileId: removedFollowee.id })
      .returning()
      .then(firstOrThrow);
    const nextPostId = createOrderedPostIdSequence();
    const ownPost = await createPost(viewer.id, nextPostId());
    const addedPost = await createPost(addedFollowee.id, nextPostId());
    const removedPost = await createPost(removedFollowee.id, nextPostId());
    cachedProfileIds.add(viewer.id);
    await cacheHomeTimelinePageWhenReady({
      profileId: viewer.id,
      postIds: [ownPost.id, removedPost.id],
    });

    await withStaleReplicaSnapshot(async () => {
      const followerFilter = eq(ProfileFollows.followerProfileId, viewer.id);
      assert.deepEqual(
        (
          await db
            .select({ followeeProfileId: ProfileFollows.followeeProfileId })
            .from(ProfileFollows)
            .where(followerFilter)
        ).map(({ followeeProfileId }) => followeeProfileId),
        [removedFollowee.id],
      );

      await db.delete(ProfileFollows).where(eq(ProfileFollows.id, follow.id));
      await db.insert(ProfileFollows).values({
        followerProfileId: viewer.id,
        followeeProfileId: addedFollowee.id,
      });

      assert.deepEqual(
        (
          await db
            .select({ followeeProfileId: ProfileFollows.followeeProfileId })
            .from(ProfileFollows)
            .where(followerFilter)
        ).map(({ followeeProfileId }) => followeeProfileId),
        [removedFollowee.id],
        'an ordinary read retains the pre-commit Follow set',
      );

      await reconcileHomeTimelineFollowChangesActivity({
        profileId: viewer.id,
        followeeProfileIds: [addedFollowee.id],
      });

      const afterFollowAddition = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
      assert.ok(afterFollowAddition);
      assert.deepEqual(
        new Set(afterFollowAddition.entries.map(({ postId }) => postId)),
        new Set([ownPost.id, addedPost.id, removedPost.id]),
      );

      await reconcileHomeTimelineFollowChangesActivity({
        profileId: viewer.id,
        followeeProfileIds: [removedFollowee.id],
      });

      const afterFollowRemoval = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
      assert.ok(afterFollowRemoval);
      assert.deepEqual(
        new Set(afterFollowRemoval.entries.map(({ postId }) => postId)),
        new Set([ownPost.id, addedPost.id]),
      );
    });
  },
);

test(
  'Home insertion activity includes a Post committed after the replica snapshot',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createProfile();
    const author = await createProfile();
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.id,
      followeeProfileId: author.id,
    });

    const nextPostId = createOrderedPostIdSequence();
    const existingPost = await createPost(viewer.id, nextPostId());
    const committedPostId = nextPostId();
    cachedProfileIds.add(viewer.id);
    await cacheHomeTimelinePageWhenReady({ profileId: viewer.id, postIds: [existingPost.id] });

    await withStaleReplicaSnapshot(async () => {
      await createPost(author.id, committedPostId);
      assert.deepEqual(
        await db.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, committedPostId)),
        [],
        'an ordinary read retains the pre-commit Post snapshot',
      );

      await insertHomeTimelinePostActivity({ profileId: viewer.id, postId: committedPostId });

      const cached = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
      assert.ok(cached);
      assert.deepEqual(
        new Set(cached.entries.map(({ postId }) => postId)),
        new Set([existingPost.id, committedPostId]),
      );
    });
  },
);

test('Post Request reconciliation finds a stable-ID Post committed after the replica snapshot', async () => {
  const author = await createAuthor();
  const postId = await generatePostIdActivity();
  postIds.push(postId);

  await withStaleReplicaSnapshot(async () => {
    const result = await createPostActivity({
      input: {
        accountId: author.account.id,
        bodyText: 'Committed before the Post Request retry',
        origin: 'LOCAL',
        profileId: author.profile.id,
        visibility: PostVisibility.PUBLIC,
      },
      postId,
      revalidateAuthorization: true,
    });
    assert.deepEqual(result, {
      ok: true,
      result: {
        authorProfileId: author.profile.id,
        postId,
        status: 'created',
      },
    });

    assert.deepEqual(
      await db.select({ id: Posts.id }).from(Posts).where(eq(Posts.id, postId)),
      [],
      'an ordinary read retains the pre-commit Post snapshot',
    );
    assert.deepEqual(
      await reconcilePostRequestActivity({
        accountId: author.account.id,
        postId,
        profileId: author.profile.id,
      }),
      { postId, status: 'PUBLISHED' },
    );
  });

  const createdPost = await db
    .select({ currentContentId: Posts.currentContentId })
    .from(Posts)
    .where(eq(Posts.id, postId))
    .then((rows) => rows[0]);
  if (createdPost?.currentContentId) {
    contentIds.push(createdPost.currentContentId);
  }
});
