import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  Bookmarks,
  db,
  firstOrThrow,
  Instances,
  pg,
  Posts,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { createBookmark, deleteBookmark } from './bookmark';

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
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const post = await db
    .insert(Posts)
    .values({
      profileId: profile.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

  return { account, instance, post, profile };
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

test('Owner는 Target Post 상태와 관계없이 Bookmark를 삭제한다', async () => {
  const { account, post, profile } = await createFixture();
  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, post.id));

  const deleted = await deleteBookmark({
    accountId: account.id,
    bookmarkId: bookmark.id,
    profileId: profile.id,
  });

  assert.deepEqual(deleted, bookmark);
  assert.equal((await loadPostBookmarks(post.id)).length, 0);
});

test('missing과 non-owner 삭제는 같은 null 결과이며 기존 관계를 노출하거나 제거하지 않는다', async () => {
  const { account, instance, post, profile } = await createFixture();
  const otherProfile = await createProfile(instance.id);
  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });

  const [missing, nonOwner] = await Promise.all([
    deleteBookmark({
      accountId: account.id,
      bookmarkId: crypto.randomUUID(),
      profileId: profile.id,
    }),
    deleteBookmark({
      accountId: account.id,
      bookmarkId: bookmark.id,
      profileId: otherProfile.id,
    }),
  ]);

  assert.equal(missing, null);
  assert.equal(nonOwner, null);
  assert.deepEqual(await loadPostBookmarks(post.id), [bookmark]);
});

test('순차·동시 삭제에서 한 요청만 삭제된 Bookmark를 반환한다', async () => {
  const { account, post, profile } = await createFixture();
  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });
  const input = { accountId: account.id, bookmarkId: bookmark.id, profileId: profile.id };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => deleteBookmark(input)));
  const repeated = await deleteBookmark(input);

  assert.deepEqual(
    concurrent.filter((result) => result !== null),
    [bookmark],
  );
  assert.equal(repeated, null);
  assert.equal((await loadPostBookmarks(post.id)).length, 0);
});

test('호출 transaction이 rollback되면 삭제한 Bookmark가 복구된다', async () => {
  const { account, post, profile } = await createFixture();
  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });

  await assert.rejects(
    db.transaction(async (tx) => {
      const deleted = await deleteBookmark(
        { accountId: account.id, bookmarkId: bookmark.id, profileId: profile.id },
        tx,
      );
      assert.equal(deleted?.id, bookmark.id);
      throw new Error('rollback');
    }),
    /rollback/,
  );

  assert.deepEqual(await loadPostBookmarks(post.id), [bookmark]);
});

test('권한 검증 이후 Profile이 비활성화되면 Bookmark를 삭제하지 않는다', async () => {
  const { account, post, profile } = await createFixture();
  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });

  const deleted = await db.transaction(async (tx) => {
    await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(and(eq(Profiles.id, profile.id), eq(Profiles.state, ProfileState.ACTIVE)))
      .then(firstOrThrow);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, profile.id));

    return deleteBookmark(
      { accountId: account.id, bookmarkId: bookmark.id, profileId: profile.id },
      tx,
    );
  });

  assert.equal(deleted, null);
  assert.deepEqual(await loadPostBookmarks(post.id), [bookmark]);
});

test('권한 검증 이후 Account membership이 제거되면 Bookmark를 삭제하지 않는다', async () => {
  const { account, post, profile } = await createFixture();
  const bookmark = await createBookmark({ postId: post.id, profileId: profile.id });

  const deleted = await db.transaction(async (tx) => {
    await tx
      .select({ id: AccountProfiles.id })
      .from(AccountProfiles)
      .where(
        and(eq(AccountProfiles.accountId, account.id), eq(AccountProfiles.profileId, profile.id)),
      )
      .then(firstOrThrow);
    await db
      .delete(AccountProfiles)
      .where(
        and(eq(AccountProfiles.accountId, account.id), eq(AccountProfiles.profileId, profile.id)),
      );

    return deleteBookmark(
      { accountId: account.id, bookmarkId: bookmark.id, profileId: profile.id },
      tx,
    );
  });

  assert.equal(deleted, null);
  assert.deepEqual(await loadPostBookmarks(post.id), [bookmark]);
});
