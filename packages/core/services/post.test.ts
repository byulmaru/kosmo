import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  Posts,
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
import { ValidationError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
import { validatePostStructure } from '../validation';
import { createPost } from './post';

after(async () => pg.end());

const createProfile = async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  return db
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
};

test('createPost는 local Post와 최초 content 연결을 하나의 transaction으로 생성한다', async () => {
  const profile = await createProfile();
  const result = await createPost({
    document: postContentDocumentFromText('local post'),
    origin: 'LOCAL',
    profileId: profile.id,
    visibility: PostVisibility.UNLISTED,
  });

  assert.equal(result.post.state, PostState.ACTIVE);
  assert.equal(result.post.visibility, PostVisibility.UNLISTED);
  assert.equal(result.post.currentContentId, result.content.id);
  assert.equal(result.content.postId, result.post.id);
  assert.equal(
    await db
      .select()
      .from(ActivityPubPosts)
      .where(eq(ActivityPubPosts.postId, result.post.id))
      .then((rows) => rows.length),
    0,
  );
});

test('createPost는 ActivityPub first-write-wins와 timestamp 계약을 보존한다', async () => {
  const profile = await createProfile();
  const objectUri = `https://remote.example/notes/${profile.id}`;
  const publishedAt = Temporal.Instant.from('2026-07-18T00:00:00Z');
  const receivedAt = Temporal.Instant.from('2026-07-19T00:00:00Z');
  const first = await createPost({
    document: postContentDocumentFromText('first'),
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId: profile.id,
    publishedAt,
    receivedAt,
    visibility: PostVisibility.PUBLIC,
  });
  const duplicate = await createPost({
    document: postContentDocumentFromText('changed'),
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId: profile.id,
    publishedAt: receivedAt.add({ hours: 1 }),
    receivedAt: receivedAt.add({ hours: 2 }),
    visibility: PostVisibility.UNLISTED,
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(first.post.currentContentId, first.content.id);
  assert.equal(first.post.createdAt.toString(), publishedAt.toString());
  assert.equal(first.content.createdAt.toString(), receivedAt.toString());
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.profileId, profile.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, first.post.id))
      .then((rows) => rows.length),
    1,
  );
});

test('Post 구조 validator는 일반 Post, Reply, Quote, Reply+Quote와 Repost만 허용한다', () => {
  const sourceId = crypto.randomUUID();
  for (const structure of [
    { hasContent: true, hasReplyParent: false, repostSourceId: null },
    { hasContent: true, hasReplyParent: true, repostSourceId: null },
    { hasContent: true, hasReplyParent: false, repostSourceId: sourceId },
    { hasContent: true, hasReplyParent: true, repostSourceId: sourceId },
    { hasContent: false, hasReplyParent: false, repostSourceId: sourceId },
  ]) {
    assert.doesNotThrow(() => validatePostStructure(structure));
  }

  for (const structure of [
    { hasContent: false, hasReplyParent: false, repostSourceId: null },
    { hasContent: false, hasReplyParent: true, repostSourceId: null },
    { hasContent: false, hasReplyParent: true, repostSourceId: sourceId },
  ]) {
    assert.throws(() => validatePostStructure(structure), ValidationError);
  }
  assert.throws(
    () =>
      validatePostStructure({
        hasContent: true,
        hasReplyParent: false,
        postId: sourceId,
        repostSourceId: sourceId,
      }),
    ValidationError,
  );
});

test('createPost는 Quote와 Repost가 Content를 가진 direct Source를 공유하게 저장한다', async () => {
  const profile = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: profile.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quote = await createPost({
    document: postContentDocumentFromText('quote'),
    origin: 'LOCAL',
    profileId: profile.id,
    repostSourceId: source.post.id,
    visibility: PostVisibility.PUBLIC,
  });
  const repost = await createPost({
    document: null,
    origin: 'LOCAL',
    profileId: profile.id,
    repostSourceId: quote.post.id,
    visibility: PostVisibility.UNLISTED,
  });

  assert.equal(quote.post.currentContentId, quote.content.id);
  assert.equal(quote.post.repostSourceId, source.post.id);
  assert.equal(repost.content, null);
  assert.equal(repost.post.currentContentId, null);
  assert.equal(repost.post.repostSourceId, quote.post.id);
});

test('createPost는 빈 구조와 Content 없는 Repost Source를 거부하고 Post를 남기지 않는다', async () => {
  const profile = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: profile.id,
    visibility: PostVisibility.PUBLIC,
  });
  const repost = await createPost({
    document: null,
    origin: 'LOCAL',
    profileId: profile.id,
    repostSourceId: source.post.id,
    visibility: PostVisibility.UNLISTED,
  });
  const postCount = async () =>
    db
      .select()
      .from(Posts)
      .where(eq(Posts.profileId, profile.id))
      .then((rows) => rows.length);
  const countBeforeRejections = await postCount();

  await assert.rejects(
    createPost({
      document: null,
      origin: 'LOCAL',
      profileId: profile.id,
      visibility: PostVisibility.UNLISTED,
    } as never),
    ValidationError,
  );
  await assert.rejects(
    createPost({
      document: postContentDocumentFromText('invalid quote'),
      origin: 'LOCAL',
      profileId: profile.id,
      repostSourceId: repost.post.id,
      visibility: PostVisibility.PUBLIC,
    }),
    ValidationError,
  );
  assert.equal(await postCount(), countBeforeRejections);
});

test('createPost는 존재하지 않거나 Tombstone인 Source를 거부하고 direct Source를 보존한다', async () => {
  const profile = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: profile.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quote = await createPost({
    document: postContentDocumentFromText('quote'),
    origin: 'LOCAL',
    profileId: profile.id,
    repostSourceId: source.post.id,
    visibility: PostVisibility.PUBLIC,
  });

  await db
    .update(Posts)
    .set({ deletedAt: Temporal.Now.instant(), state: PostState.DELETED })
    .where(eq(Posts.id, source.post.id));

  assert.equal(
    await db
      .select({ repostSourceId: Posts.repostSourceId })
      .from(Posts)
      .where(eq(Posts.id, quote.post.id))
      .then((rows) => rows[0]?.repostSourceId),
    source.post.id,
  );
  for (const repostSourceId of [source.post.id, crypto.randomUUID()]) {
    await assert.rejects(
      createPost({
        document: null,
        origin: 'LOCAL',
        profileId: profile.id,
        repostSourceId,
        visibility: PostVisibility.UNLISTED,
      }),
      ValidationError,
    );
  }
});
