import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg, Posts, ProfileFollows, Profiles } from '../db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost, deletePost, repostPost } from './post';

after(async () => pg.end());

const createProfile = async ({
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  profileState = ProfileState.ACTIVE,
}: {
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  profileState?: ProfileState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
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

  return { instance, profile };
};

const createContentPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) =>
  createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId,
    visibility,
  }).then(({ post }) => post);

test('repostPost는 Public과 Unlisted Source를 direct Unlisted Repost로 생성한다', async () => {
  const actor = await createProfile();

  for (const sourceVisibility of [PostVisibility.PUBLIC, PostVisibility.UNLISTED]) {
    const source = await createContentPost(actor.profile.id, sourceVisibility);
    const { repost } = await repostPost({
      actorProfileId: actor.profile.id,
      sourcePostId: source.id,
    });

    assert.equal(repost.profileId, actor.profile.id);
    assert.equal(repost.currentContentId, null);
    assert.equal(repost.replyParentId, null);
    assert.equal(repost.repostSourceId, source.id);
    assert.equal(repost.state, PostState.ACTIVE);
    assert.equal(repost.visibility, PostVisibility.UNLISTED);
  }
});

test('repostPost는 자신의 Followers Only Source를 Followers Only로 생성한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id, PostVisibility.FOLLOWERS);

  const { repost } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });

  assert.equal(repost.visibility, PostVisibility.FOLLOWERS);
  assert.equal(repost.repostSourceId, source.id);
});

test('repostPost는 조회 가능한 허용 불가 Source를 sourceId VALIDATION으로 거부한다', async () => {
  const actor = await createProfile();
  const author = await createProfile();
  await db.insert(ProfileFollows).values({
    followeeProfileId: author.profile.id,
    followerProfileId: actor.profile.id,
  });
  const followersSource = await createContentPost(author.profile.id, PostVisibility.FOLLOWERS);
  const directSource = await createContentPost(actor.profile.id, PostVisibility.DIRECT);
  const contentSource = await createContentPost(author.profile.id);
  const contentlessSource = await db
    .insert(Posts)
    .values({
      profileId: author.profile.id,
      repostSourceId: contentSource.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.UNLISTED,
    })
    .returning()
    .then(firstOrThrow);

  for (const sourcePostId of [followersSource.id, directSource.id, contentlessSource.id]) {
    await assert.rejects(
      repostPost({
        actorProfileId: actor.profile.id,
        sourcePostId,
      }),
      (error) =>
        error instanceof ValidationError &&
        error.code === 'VALIDATION' &&
        error.field === 'sourceId',
    );
  }
});

test('repostPost는 누락·Tombstone·조회 불가 Source를 같은 NOT_FOUND로 숨긴다', async () => {
  const actor = await createProfile();
  const author = await createProfile();
  const hidden = await createContentPost(author.profile.id, PostVisibility.FOLLOWERS);
  const tombstone = await createContentPost(author.profile.id);
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, tombstone.id));

  for (const sourcePostId of [crypto.randomUUID(), hidden.id, tombstone.id]) {
    await assert.rejects(
      repostPost({
        actorProfileId: actor.profile.id,
        sourcePostId,
      }),
      (error) => error instanceof NotFoundError && error.code === 'NOT_FOUND',
    );
  }
});

test('repostPost는 Active Local과 Remote actor가 공통 action을 사용할 수 있다', async () => {
  const sourceAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.profile.id);

  for (const actor of [
    await createProfile(),
    await createProfile({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.UNRESPONSIVE,
    }),
  ]) {
    const { repost } = await repostPost({
      actorProfileId: actor.profile.id,
      sourcePostId: source.id,
    });
    assert.equal(repost.profileId, actor.profile.id);
  }
});

test('repostPost는 비활성 Profile 또는 Suspended Instance actor를 거부한다', async () => {
  const sourceAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.profile.id);

  for (const actor of [
    await createProfile({ profileState: ProfileState.DISABLED }),
    await createProfile({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.SUSPENDED,
    }),
  ]) {
    await assert.rejects(
      repostPost({
        actorProfileId: actor.profile.id,
        sourcePostId: source.id,
      }),
      (error) => error instanceof PermissionDeniedError && error.code === 'PERMISSION_DENIED',
    );
  }
});

test('repostPost는 조회 가능한 Quote의 Source 상태와 무관하게 Quote를 직접 참조한다', async () => {
  const actor = await createProfile();
  const base = await createContentPost(actor.profile.id);
  const quote = await createContentPost(actor.profile.id);
  await db.update(Posts).set({ repostSourceId: base.id }).where(eq(Posts.id, quote.id));

  const { repost } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: quote.id,
  });
  assert.equal(repost.repostSourceId, quote.id);

  const hiddenBase = await createContentPost(actor.profile.id);
  const unavailableQuote = await createContentPost(actor.profile.id);
  await db
    .update(Posts)
    .set({ repostSourceId: hiddenBase.id })
    .where(eq(Posts.id, unavailableQuote.id));
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, hiddenBase.id));

  const { repost: unavailableSourceRepost } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: unavailableQuote.id,
  });
  assert.equal(unavailableSourceRepost.repostSourceId, unavailableQuote.id);
});

test('repostPost의 순차·동시 요청은 같은 Active Repost identity로 수렴한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const input = {
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => repostPost(input)));
  const first = concurrent[0]!.repost;
  const repeatedResult = await repostPost(input);
  const repeated = repeatedResult.repost;

  assert.equal(repeated.id, first.id);
  assert.equal(concurrent.filter(({ created }) => created).length, 1);
  assert.equal(repeatedResult.created, false);
  assert.deepEqual(
    concurrent.map(({ repost }) => repost.id),
    Array(4).fill(first.id),
  );
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(
        and(
          eq(Posts.profileId, actor.profile.id),
          eq(Posts.repostSourceId, source.id),
          eq(Posts.state, PostState.ACTIVE),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
});

test('repostPost는 caller transaction rollback에 합류한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);

  await assert.rejects(
    db.transaction(async (tx) => {
      await repostPost(
        {
          actorProfileId: actor.profile.id,
          sourcePostId: source.id,
        },
        tx,
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );

  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(and(eq(Posts.profileId, actor.profile.id), eq(Posts.repostSourceId, source.id)))
      .then((rows) => rows.length),
    0,
  );
});

test('deletePost는 Author의 Repost를 Tombstone 처리하고 새 Repost를 허용한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const { repost } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });

  assert.deepEqual(await deletePost({ actorProfileId: actor.profile.id, postId: repost.id }), {
    postId: repost.id,
  });

  const deleted = await db.select().from(Posts).where(eq(Posts.id, repost.id)).then(firstOrThrow);
  assert.equal(deleted.state, PostState.DELETED);
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.repostSourceId, source.id);
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(
        and(
          eq(Posts.repostSourceId, source.id),
          eq(Posts.state, PostState.ACTIVE),
          isNull(Posts.currentContentId),
        ),
      )
      .then((rows) => rows.length),
    0,
  );

  const { repost: recreated } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });
  assert.notEqual(recreated.id, repost.id);
  assert.equal(recreated.state, PostState.ACTIVE);
});

test('deletePost의 반복·동시 호출은 최초 삭제 시각을 보존하며 멱등 성공한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const { repost } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });
  const input = { actorProfileId: actor.profile.id, postId: repost.id };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => deletePost(input)));
  assert.deepEqual(
    concurrent,
    Array.from({ length: 4 }, () => ({ postId: repost.id })),
  );

  const firstDeletedAt = await db
    .select({ deletedAt: Posts.deletedAt })
    .from(Posts)
    .where(eq(Posts.id, repost.id))
    .then(firstOrThrow)
    .then(({ deletedAt }) => deletedAt);
  assert.ok(firstDeletedAt);

  assert.deepEqual(await deletePost(input), { postId: repost.id });
  const repeatedDeletedAt = await db
    .select({ deletedAt: Posts.deletedAt })
    .from(Posts)
    .where(eq(Posts.id, repost.id))
    .then(firstOrThrow)
    .then(({ deletedAt }) => deletedAt);
  assert.equal(repeatedDeletedAt?.toString(), firstDeletedAt.toString());
});

test('deletePost는 다른 Author의 Post를 거부하고 누락 Post를 숨긴다', async () => {
  const author = await createProfile();
  const other = await createProfile();
  const post = await createContentPost(author.profile.id);

  await assert.rejects(
    deletePost({ actorProfileId: other.profile.id, postId: post.id }),
    (error) => error instanceof PermissionDeniedError && error.code === 'PERMISSION_DENIED',
  );
  await assert.rejects(
    deletePost({ actorProfileId: author.profile.id, postId: crypto.randomUUID() }),
    (error) => error instanceof NotFoundError && error.code === 'NOT_FOUND',
  );

  const stored = await db
    .select({ state: Posts.state })
    .from(Posts)
    .where(eq(Posts.id, post.id))
    .then(firstOrThrow);
  assert.equal(stored.state, PostState.ACTIVE);
});

test('deletePost는 대상 Quote만 삭제하고 별도 Active Repost는 유지한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const quote = await createContentPost(actor.profile.id);
  await db.update(Posts).set({ repostSourceId: source.id }).where(eq(Posts.id, quote.id));
  const { repost } = await repostPost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });

  await deletePost({ actorProfileId: actor.profile.id, postId: quote.id });

  const [deletedQuote, activeRepost] = await Promise.all([
    db.select().from(Posts).where(eq(Posts.id, quote.id)).then(firstOrThrow),
    db.select().from(Posts).where(eq(Posts.id, repost.id)).then(firstOrThrow),
  ]);
  assert.equal(deletedQuote.state, PostState.DELETED);
  assert.equal(deletedQuote.currentContentId, quote.currentContentId);
  assert.equal(activeRepost.state, PostState.ACTIVE);
});

test('deletePost는 caller transaction rollback에 합류한다', async () => {
  const actor = await createProfile();
  const post = await createContentPost(actor.profile.id);

  await assert.rejects(
    db.transaction(async (tx) => {
      await deletePost({ actorProfileId: actor.profile.id, postId: post.id }, tx);
      throw new Error('rollback');
    }),
    /rollback/,
  );

  const stored = await db
    .select({ deletedAt: Posts.deletedAt, state: Posts.state })
    .from(Posts)
    .where(eq(Posts.id, post.id))
    .then(firstOrThrow);
  assert.equal(stored.state, PostState.ACTIVE);
  assert.equal(stored.deletedAt, null);
});
