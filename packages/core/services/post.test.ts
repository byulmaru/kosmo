import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  Accounts,
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  Media,
  Notifications,
  pg,
  PostContents,
  Posts,
  Profiles,
} from '../db';
import {
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, ValidationError } from '../error';
import {
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
} from '../post-content/server';
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

const createAccount = () =>
  db
    .insert(Accounts)
    .values({
      displayName: crypto.randomUUID(),
      oidcSubject: crypto.randomUUID(),
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createMedia = async ({
  accountId,
  profileId,
  source = MediaSource.LOCAL,
  state = MediaState.READY,
}: {
  accountId: string;
  profileId: string;
  source?: MediaSource;
  state?: MediaState;
}) =>
  db
    .insert(Media)
    .values({
      accountId: source === MediaSource.LOCAL ? accountId : null,
      mediaType:
        source === MediaSource.LOCAL && state === MediaState.UPLOADING ? null : 'image/webp',
      profileId,
      readyAt:
        source === MediaSource.LOCAL && state === MediaState.READY ? Temporal.Now.instant() : null,
      source,
      state,
      storageReference: source === MediaSource.LOCAL ? `u_${crypto.randomUUID()}` : null,
      uploadExpiresAt:
        source === MediaSource.LOCAL ? Temporal.Now.instant().add({ minutes: 5 }) : null,
      url: state === MediaState.READY ? `https://media.example/${crypto.randomUUID()}.webp` : null,
    })
    .returning()
    .then(firstOrThrow);

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

test('createPost는 같은 Upload Account의 Ready Local Media를 document 순서대로 저장한다', async () => {
  const account = await createAccount();
  const author = await createProfile();
  const uploadProfile = await createProfile();
  const firstMedia = await createMedia({
    accountId: account.id,
    profileId: uploadProfile.id,
  });
  const secondMedia = await createMedia({ accountId: account.id, profileId: author.id });

  const result = await createPost({
    accountId: account.id,
    document: postContentDocumentFromTextAndMedia(
      '',
      [{ mediaId: firstMedia.id }, { mediaId: secondMedia.id }],
      true,
    ),
    media: [
      { altText: 'first', mediaId: firstMedia.id },
      { altText: null, mediaId: secondMedia.id },
    ],
    origin: 'LOCAL',
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });

  assert.deepEqual(
    result.content.document.body.content.flatMap((block) =>
      block.type === 'media' ? [block.attrs] : [],
    ),
    [{ mediaId: firstMedia.id }, { mediaId: secondMedia.id }],
  );
  assert.equal(
    await db
      .select({ altText: Media.altText })
      .from(Media)
      .where(eq(Media.id, firstMedia.id))
      .then(firstOrThrow)
      .then(({ altText }) => altText),
    'first',
  );
  assert.equal(
    await db
      .select({ altText: Media.altText })
      .from(Media)
      .where(eq(Media.id, secondMedia.id))
      .then(firstOrThrow)
      .then(({ altText }) => altText),
    null,
  );
  assert.deepEqual(result.content.document.body.attrs, { sensitiveMedia: true });
});

test('createPost는 사용할 수 없는 Media를 같은 오류로 거부하고 Post를 남기지 않는다', async () => {
  const account = await createAccount();
  const otherAccount = await createAccount();
  const profile = await createProfile();
  const uploading = await createMedia({
    accountId: account.id,
    profileId: profile.id,
    state: MediaState.UPLOADING,
  });
  const remote = await createMedia({
    accountId: account.id,
    profileId: profile.id,
    source: MediaSource.REMOTE,
  });
  const otherAccountMedia = await createMedia({
    accountId: otherAccount.id,
    profileId: profile.id,
  });
  const initialPostCount = await db.$count(Posts);
  const initialContentCount = await db.$count(PostContents);

  for (const mediaId of [uploading.id, remote.id, otherAccountMedia.id, crypto.randomUUID()]) {
    await assert.rejects(
      createPost({
        accountId: account.id,
        document: postContentDocumentFromTextAndMedia('body', [{ mediaId }]),
        media: [{ altText: null, mediaId }],
        origin: 'LOCAL',
        profileId: profile.id,
        visibility: PostVisibility.PUBLIC,
      }),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.field === 'media' &&
        error.message === 'Media cannot be attached',
    );
  }

  assert.equal(await db.$count(Posts), initialPostCount);
  assert.equal(await db.$count(PostContents), initialContentCount);
});

test('createPost는 중복 Media와 Media Account 증거 누락을 원자적으로 거부한다', async () => {
  const account = await createAccount();
  const profile = await createProfile();
  const media = await createMedia({ accountId: account.id, profileId: profile.id });
  const initialPostCount = await db.$count(Posts);

  await assert.rejects(
    createPost({
      accountId: account.id,
      document: postContentDocumentFromTextAndMedia('body', [
        { mediaId: media.id },
        { mediaId: media.id },
      ]),
      media: [
        { altText: null, mediaId: media.id },
        { altText: 'duplicate', mediaId: media.id },
      ],
      origin: 'LOCAL',
      profileId: profile.id,
      visibility: PostVisibility.PUBLIC,
    }),
    (error: unknown) => error instanceof ValidationError && error.field === 'media',
  );
  await assert.rejects(
    createPost({
      document: postContentDocumentFromTextAndMedia('body', [{ mediaId: media.id }]),
      media: [{ altText: null, mediaId: media.id }],
      origin: 'LOCAL',
      profileId: profile.id,
      visibility: PostVisibility.PUBLIC,
    }),
    (error: unknown) => error instanceof ValidationError && error.field === 'media',
  );

  assert.equal(await db.$count(Posts), initialPostCount);
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

test('createPost는 ActivityPub Remote Media를 생성하고 document 끝에 원래 순서로 연결한다', async () => {
  const profile = await createProfile();
  const firstUrl = `https://remote.example/media/${crypto.randomUUID()}.png`;
  const secondUrl = `https://remote.example/media/${crypto.randomUUID()}.webp`;
  const result = await createPost({
    document: postContentDocumentFromText('remote images'),
    media: [
      { altText: 'first', mediaType: 'image/png', url: firstUrl },
      { altText: null, mediaType: null, url: secondUrl },
    ],
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: profile.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-31T00:00:00Z'),
    visibility: PostVisibility.PUBLIC,
  });

  assert.equal(result.created, true);
  const media = await db
    .select()
    .from(Media)
    .where(eq(Media.profileId, profile.id))
    .then((rows) => rows.sort((left, right) => left.url!.localeCompare(right.url!)));
  const mediaIdByUrl = new Map(media.map((item) => [item.url, item.id]));
  assert.deepEqual(
    media.map(
      ({
        accountId,
        altText,
        mediaType,
        readyAt,
        source,
        state,
        storageReference,
        uploadExpiresAt,
        url,
      }) => ({
        accountId,
        altText,
        mediaType,
        readyAt,
        source,
        state,
        storageReference,
        uploadExpiresAt,
        url,
      }),
    ),
    [
      {
        accountId: null,
        altText: 'first',
        mediaType: 'image/png',
        readyAt: null,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        storageReference: null,
        uploadExpiresAt: null,
        url: firstUrl,
      },
      {
        accountId: null,
        altText: null,
        mediaType: null,
        readyAt: null,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        storageReference: null,
        uploadExpiresAt: null,
        url: secondUrl,
      },
    ].sort((left, right) => left.url.localeCompare(right.url)),
  );
  assert.deepEqual(
    result.content.document.body.content.flatMap((block) =>
      block.type === 'media' ? [block.attrs] : [],
    ),
    [{ mediaId: mediaIdByUrl.get(firstUrl) }, { mediaId: mediaIdByUrl.get(secondUrl) }],
  );
});

test('createPost는 같은 Profile과 URL의 Remote Media도 attachment별로 저장한다', async () => {
  const profile = await createProfile();
  const url = `https://remote.example/media/${crypto.randomUUID()}.png`;
  const first = await createPost({
    document: postContentDocumentFromText('first'),
    media: [{ altText: 'first alt', mediaType: 'image/png', url }],
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: profile.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-31T00:00:00Z'),
    visibility: PostVisibility.PUBLIC,
  });
  const second = await createPost({
    document: postContentDocumentFromText('second'),
    media: [{ altText: 'second alt', mediaType: 'image/webp', url }],
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: profile.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-31T00:01:00Z'),
    visibility: PostVisibility.PUBLIC,
  });

  const media = await db.select().from(Media).where(eq(Media.url, url));
  assert.equal(media.length, 2);
  assert.deepEqual(
    media.map(({ altText, mediaType }) => ({ altText, mediaType })),
    [
      { altText: 'first alt', mediaType: 'image/png' },
      { altText: 'second alt', mediaType: 'image/webp' },
    ],
  );
  const referencedMediaIds = [first, second].map((result) =>
    result.content.document.body.content.flatMap((block) =>
      block.type === 'media' ? [block.attrs.mediaId] : [],
    ),
  );
  assert.equal(new Set(referencedMediaIds.flat()).size, 2);
  assert.deepEqual(new Set(referencedMediaIds.flat()), new Set(media.map(({ id }) => id)));
});

test('createPost는 다른 Profile의 같은 Remote URL을 각 Profile 소유 Media로 저장한다', async () => {
  const owner = await createProfile();
  const other = await createProfile();
  const url = `https://remote.example/media/${crypto.randomUUID()}.png`;
  const ownerPost = await createPost({
    document: postContentDocumentFromText('owner'),
    media: [{ altText: null, mediaType: 'image/png', url }],
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: owner.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-31T00:00:00Z'),
    visibility: PostVisibility.PUBLIC,
  });
  const otherPost = await createPost({
    document: postContentDocumentFromText('other'),
    media: [{ altText: null, mediaType: 'image/webp', url }],
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: other.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-31T00:01:00Z'),
    visibility: PostVisibility.PUBLIC,
  });

  const media = await db.select().from(Media).where(eq(Media.url, url));
  assert.equal(media.length, 2);
  assert.deepEqual(new Set(media.map(({ profileId }) => profileId)), new Set([owner.id, other.id]));
  assert.notDeepEqual(
    ownerPost.content.document.body.content.flatMap((block) =>
      block.type === 'media' ? [block.attrs.mediaId] : [],
    ),
    otherPost.content.document.body.content.flatMap((block) =>
      block.type === 'media' ? [block.attrs.mediaId] : [],
    ),
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

test('createPost는 caller transaction rollback에 Post와 Content를 남기지 않는다', async () => {
  const profile = await createProfile();
  const contentCount = await db.$count(PostContents);

  await assert.rejects(
    db.transaction(async (tx) => {
      await createPost(
        {
          document: postContentDocumentFromText('rollback'),
          origin: 'LOCAL',
          profileId: profile.id,
          visibility: PostVisibility.PUBLIC,
        },
        tx,
      );
      throw new Error('rollback caller transaction');
    }),
    /rollback caller transaction/,
  );

  assert.equal(await db.$count(Posts, eq(Posts.profileId, profile.id)), 0);
  assert.equal(await db.$count(PostContents), contentCount);
});

test('caller transaction의 Post effects는 outer commit 뒤에만 실행한다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const parent = await createPost({
    document: postContentDocumentFromText('parent'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  let replyId: string | undefined;
  let postCommit: (() => Promise<void>) | undefined;
  await db.transaction(async (tx) => {
    const reply = await createPost(
      {
        document: postContentDocumentFromText('reply'),
        origin: 'LOCAL',
        profileId: author.id,
        replyParentId: parent.post.id,
        visibility: PostVisibility.PUBLIC,
      },
      tx,
    );
    replyId = reply.post.id;
    postCommit = reply.postCommit;

    assert.equal(await tx.$count(Notifications, eq(Notifications.sourceId, reply.post.id)), 0);
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, reply.post.id)), 0);
  });

  assert.ok(replyId);
  assert.ok(postCommit);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, replyId)), 0);

  const previousAddress = process.env.TEMPORAL_ADDRESS;
  const previousNamespace = process.env.TEMPORAL_NAMESPACE;
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_NAMESPACE;
  try {
    await postCommit();
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, replyId)), 0);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.TEMPORAL_NAMESPACE;
    } else {
      process.env.TEMPORAL_NAMESPACE = previousNamespace;
    }
  }
});

test('ActivityPub Reply effects는 duplicate에서 backfill하지 않는다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const parent = await createPost({
    document: postContentDocumentFromText('parent'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const input = {
    document: postContentDocumentFromText('remote reply'),
    objectUri: `https://remote.example/notes/reply-notification-${author.id}`,
    origin: 'ACTIVITYPUB' as const,
    profileId: author.id,
    publishedAt: null,
    receivedAt: Temporal.Instant.from('2026-07-30T00:00:00Z'),
    replyParentId: parent.post.id,
    visibility: PostVisibility.PUBLIC,
  };

  const results = await Promise.all([createPost(input), createPost(input)]);
  const created = results.find((result) => result.created);
  assert.ok(created);
  assert.deepEqual(results.map(({ created }) => created).sort(), [false, true]);
  assert.equal(created.created, true);
  assert.equal(typeof created.postCommit, 'function');
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, created.post.id)), 0);

  const duplicate = await createPost(input);

  assert.equal(duplicate.created, false);
  assert.equal('postCommit' in duplicate, false);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, created.post.id)), 0);
});

test('Post effects Workflow start와 observer 실패가 Post transaction과 호출을 실패시키지 않는다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const parent = await createPost({
    document: postContentDocumentFromText('parent'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const objectUri = `https://remote.example/notes/reply-observer-failure-${crypto.randomUUID()}`;
  let observerCalls = 0;

  const previousAddress = process.env.TEMPORAL_ADDRESS;
  const previousNamespace = process.env.TEMPORAL_NAMESPACE;
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_NAMESPACE;
  try {
    const result = await createPost({
      document: postContentDocumentFromText('remote reply'),
      objectUri,
      onPostCommitError: () => {
        observerCalls += 1;
        throw new Error('observer failure');
      },
      origin: 'ACTIVITYPUB',
      profileId: author.id,
      publishedAt: null,
      receivedAt: Temporal.Instant.from('2026-07-30T00:00:00Z'),
      replyParentId: parent.post.id,
      visibility: PostVisibility.PUBLIC,
    });

    assert.equal(result.created, true);
    assert.equal(observerCalls, 0);
    assert.equal(result.post.replyParentId, parent.post.id);
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, result.post.id)), 0);
    await result.postCommit();
    await result.postCommit();
    assert.equal(observerCalls, 1);
    assert.equal(await db.$count(Posts, eq(Posts.id, result.post.id)), 1);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.TEMPORAL_NAMESPACE;
    } else {
      process.env.TEMPORAL_NAMESPACE = previousNamespace;
    }
  }
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
