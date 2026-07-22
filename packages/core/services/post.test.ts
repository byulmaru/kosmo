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
import { NotFoundError, ValidationError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
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

test('createPost는 Local과 ActivityPub Reply Parent를 직접 저장한다', async () => {
  const profile = await createProfile();
  const parent = await createPost({
    document: postContentDocumentFromText('parent'),
    origin: 'LOCAL',
    profileId: profile.id,
    visibility: PostVisibility.PUBLIC,
  });
  const localReply = await createPost({
    document: postContentDocumentFromText('local reply'),
    origin: 'LOCAL',
    profileId: profile.id,
    replyParentId: parent.post.id,
    visibility: PostVisibility.UNLISTED,
  });
  const activityPubReply = await createPost({
    document: postContentDocumentFromText('remote reply'),
    objectUri: `https://remote.example/notes/reply-${profile.id}`,
    origin: 'ACTIVITYPUB',
    profileId: profile.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-22T00:00:00Z'),
    replyParentId: parent.post.id,
    visibility: PostVisibility.PUBLIC,
  });

  assert.equal(localReply.post.replyParentId, parent.post.id);
  assert.equal(activityPubReply.created, true);
  assert.equal(activityPubReply.post.replyParentId, parent.post.id);
});

test('createPost는 존재하지 않는 Reply Parent에서 ActivityPub transaction을 rollback한다', async () => {
  const profile = await createProfile();
  const objectUri = `https://remote.example/notes/orphan-${profile.id}`;

  await assert.rejects(
    createPost({
      document: postContentDocumentFromText('orphan reply'),
      objectUri,
      origin: 'ACTIVITYPUB',
      profileId: profile.id,
      publishedAt: null,
      receivedAt: Temporal.Instant.from('2026-07-22T00:00:00Z'),
      replyParentId: '00000000-0000-8000-8000-000000000099',
      visibility: PostVisibility.PUBLIC,
    }),
    (error) => error instanceof NotFoundError && error.message === 'Post not found',
  );

  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.profileId, profile.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ActivityPubPosts)
      .where(eq(ActivityPubPosts.uri, objectUri))
      .then((rows) => rows.length),
    0,
  );
});

test('createPost는 Content 없는 Reply Parent에서 field 오류와 함께 rollback한다', async () => {
  const profile = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: profile.id,
    visibility: PostVisibility.PUBLIC,
  });
  const contentlessParent = await db
    .insert(Posts)
    .values({
      profileId: profile.id,
      repostSourceId: source.post.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

  await assert.rejects(
    createPost({
      document: postContentDocumentFromText('invalid reply'),
      origin: 'LOCAL',
      profileId: profile.id,
      replyParentId: contentlessParent.id,
      visibility: PostVisibility.PUBLIC,
    }),
    (error) =>
      error instanceof ValidationError &&
      error.field === 'replyParentId' &&
      error.message === 'Reply Parent must have content',
  );

  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.profileId, profile.id))
      .then((rows) => rows.length),
    2,
  );
});
