import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { Bookmarks, db, firstOrThrow, Instances, pg, Posts, Profiles } from '../db';
import {
  InstanceKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { createBookmark } from './bookmark';

after(async () => {
  await pg.end();
});

const createFixture = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(instance.id, suffix);
  const post = await db
    .insert(Posts)
    .values({
      profileId: profile.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

  return { instance, post, profile };
};

const createProfile = (instanceId: string, suffix = crypto.randomUUID()) =>
  db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const loadPostBookmarks = (postId: string) =>
  db.select().from(Bookmarks).where(eq(Bookmarks.postId, postId));

test('검증된 Profile/Post 관계를 Account 조회 없이 Bookmark로 생성한다', async () => {
  const { post, profile } = await createFixture();

  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });

  assert.equal(bookmark.postId, post.id);
  assert.equal(bookmark.profileId, profile.id);
  assert.deepEqual(await loadPostBookmarks(post.id), [bookmark]);
});

test('순차·동시 중복 생성은 기존 ID와 생성 시각을 유지한다', async () => {
  const { post, profile } = await createFixture();
  const input = { postId: post.id, profileId: profile.id };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => createBookmark(input)));
  const repeated = await createBookmark(input);

  assert.equal(new Set(concurrent.map(({ id }) => id)).size, 1);
  assert.equal(repeated.id, concurrent[0]!.id);
  assert.equal(repeated.createdAt.toString(), concurrent[0]!.createdAt.toString());
  assert.equal((await loadPostBookmarks(post.id)).length, 1);
});

test('서로 다른 Profile은 같은 Post를 독립적으로 저장한다', async () => {
  const { instance, post, profile } = await createFixture();
  const otherProfile = await createProfile(instance.id);

  const [first, second] = await Promise.all([
    createBookmark({ postId: post.id, profileId: profile.id }),
    createBookmark({ postId: post.id, profileId: otherProfile.id }),
  ]);

  assert.notEqual(first.id, second.id);
  assert.equal((await loadPostBookmarks(post.id)).length, 2);
});

test('호출 transaction이 rollback되면 생성한 Bookmark도 남지 않는다', async () => {
  const { post, profile } = await createFixture();

  await assert.rejects(
    db.transaction(async (tx) => {
      await createBookmark({ postId: post.id, profileId: profile.id }, tx);
      throw new Error('rollback');
    }),
    /rollback/,
  );

  assert.equal((await loadPostBookmarks(post.id)).length, 0);
});
