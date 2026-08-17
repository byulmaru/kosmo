import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost, deletePost as deletePostAction, repostPost as repostPostAction } from './post';

const publicOrigin = 'http://127.0.0.1:4173';
process.env.PUBLIC_ORIGIN = publicOrigin;
before(async () => {
  const { seedDatabase } = await import('../db/seed');
  await seedDatabase({ publicOrigin });
});

afterEach(() => {
  mock.restoreAll();
});

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

const runRepost = async (input: {
  actorProfileId: string;
  origin?: 'LOCAL' | 'ACTIVITYPUB';
  sourcePostId: string;
}) => repostPostAction({ ...input, origin: input.origin ?? 'LOCAL' });

const runDelete = async (input: {
  actorProfileId: string;
  origin?: 'LOCAL' | 'ACTIVITYPUB';
  postId: string;
}) => {
  const result = await deletePostAction({ ...input, origin: input.origin ?? 'LOCAL' });
  return { postId: result.postId };
};

test('repostPost는 Public과 Unlisted Source를 direct Unlisted Repost로 생성한다', async () => {
  const actor = await createProfile();

  for (const sourceVisibility of [PostVisibility.PUBLIC, PostVisibility.UNLISTED]) {
    const source = await createContentPost(actor.profile.id, sourceVisibility);
    const { repost } = await runRepost({
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

  const { repost } = await runRepost({
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
      runRepost({
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
      runRepost({
        actorProfileId: actor.profile.id,
        sourcePostId,
      }),
      (error) => error instanceof NotFoundError && error.code === 'NOT_FOUND',
    );
  }
});

test('repostPost core는 entry에서 검증된 행동 주체의 Profile/Instance 상태를 다시 조회하지 않는다', async () => {
  const sourceAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.profile.id);

  for (const actor of [
    await createProfile(),
    await createProfile({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.UNRESPONSIVE,
    }),
    await createProfile({ profileState: ProfileState.DISABLED }),
    await createProfile({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.SUSPENDED,
    }),
  ]) {
    const { repost } = await runRepost({
      actorProfileId: actor.profile.id,
      sourcePostId: source.id,
    });
    assert.equal(repost.profileId, actor.profile.id);
  }
});

test('repostPost는 조회 가능한 Quote의 Source 상태와 무관하게 Quote를 직접 참조한다', async () => {
  const actor = await createProfile();
  const base = await createContentPost(actor.profile.id);
  const quote = await createContentPost(actor.profile.id);
  await db.update(Posts).set({ repostSourceId: base.id }).where(eq(Posts.id, quote.id));

  const { repost } = await runRepost({
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

  const { repost: unavailableSourceRepost } = await runRepost({
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

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => runRepost(input)));
  const first = concurrent[0]!.repost;
  const repeatedResult = await runRepost(input);
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

test('최초 Repost create와 delete가 event-specific Workflow를 시작한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const { temporalClient } = await import('../temporal/client');
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
  const input = { actorProfileId: actor.profile.id, sourcePostId: source.id };

  const first = await runRepost(input);
  const duplicate = await runRepost(input);
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(start.mock.callCount(), 1);
  const firstStart = start.mock.calls[0];
  assert.ok(firstStart);
  const firstOptions = firstStart.arguments[1];
  assert.ok(firstOptions);
  assert.equal(firstOptions.workflowId, `post-repost:${first.repost.id}`);

  await Promise.all(
    Array.from({ length: 4 }, () =>
      runDelete({
        actorProfileId: actor.profile.id,
        postId: first.repost.id,
      }),
    ),
  );
  assert.equal(start.mock.callCount(), 2);
  const deleteStart = start.mock.calls[1];
  assert.ok(deleteStart);
  const deleteOptions = deleteStart.arguments[1];
  assert.ok(deleteOptions);
  assert.equal(deleteOptions.workflowId, `post-delete:${first.repost.id}`);
  assert.deepEqual(deleteOptions.args, [
    { postKind: 'REPOST', origin: 'LOCAL', postId: first.repost.id },
  ]);
  await runDelete({ actorProfileId: actor.profile.id, postId: first.repost.id });
  assert.equal(start.mock.callCount(), 2);
});

test('Post delete가 공통 Delete Workflow에 Post kind를 전달한다', async () => {
  const actor = await createProfile();
  const post = await createContentPost(actor.profile.id);
  const { temporalClient } = await import('../temporal/client');
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  await runDelete({ actorProfileId: actor.profile.id, postId: post.id });

  assert.equal(start.mock.callCount(), 1);
  const options = start.mock.calls[0]?.arguments[1];
  assert.ok(options);
  assert.deepEqual(options.args, [{ postKind: 'POST', origin: 'LOCAL', postId: post.id }]);
});

test('Post delete가 Reply·Quote·Reply Quote의 구조별 Post kind를 전달한다', async () => {
  const actor = await createProfile();
  const parent = await createContentPost(actor.profile.id);
  const source = await createContentPost(actor.profile.id);
  const reply = await createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId: actor.profile.id,
    replyParentId: parent.id,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);
  const quote = await createContentPost(actor.profile.id);
  await db.update(Posts).set({ repostSourceId: source.id }).where(eq(Posts.id, quote.id));
  const replyQuote = await createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId: actor.profile.id,
    replyParentId: parent.id,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);
  await db.update(Posts).set({ repostSourceId: source.id }).where(eq(Posts.id, replyQuote.id));

  const { temporalClient } = await import('../temporal/client');
  const starts: unknown[] = [];
  mock.method(
    temporalClient.workflow,
    'start',
    async (_type: string, options: { args: unknown[] }) => {
      starts.push(options.args[0]);
      return undefined as never;
    },
  );

  for (const post of [reply, quote, replyQuote]) {
    await runDelete({ actorProfileId: actor.profile.id, postId: post.id });
  }

  assert.deepEqual(starts, [
    { postKind: 'REPLY', origin: 'LOCAL', postId: reply.id },
    { postKind: 'QUOTE', origin: 'LOCAL', postId: quote.id },
    { postKind: 'REPLY_QUOTE', origin: 'LOCAL', postId: replyQuote.id },
  ]);
});

test('ActivityPub origin은 outbound effect 없이 Repost Workflow만 시작한다', async () => {
  const sourceAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.profile.id);
  const actor = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const { temporalClient } = await import('../temporal/client');
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
  const notificationCount = await db.$count(Notifications);

  const result = await repostPostAction({
    actorProfileId: actor.profile.id,
    origin: 'ACTIVITYPUB',
    sourcePostId: source.id,
  });

  assert.equal(result.created, true);
  assert.equal(start.mock.callCount(), 1);
  assert.equal(await db.$count(Notifications), notificationCount);
});

test('event-specific Workflow start 실패는 committed Repost와 삭제 결과를 바꾸지 않는다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const { temporalClient } = await import('../temporal/client');
  mock.method(temporalClient.workflow, 'start', async () => {
    throw new Error('Temporal unavailable');
  });

  const created = await repostPostAction({
    actorProfileId: actor.profile.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });
  assert.equal(created.created, true);
  assert.equal(
    await db
      .select({ state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, created.repost.id))
      .then(firstOrThrow)
      .then(({ state }) => state),
    PostState.ACTIVE,
  );

  const deleted = await deletePostAction({
    actorProfileId: actor.profile.id,
    origin: 'LOCAL',
    postId: created.repost.id,
  });
  assert.equal(deleted.postId, created.repost.id);
  assert.equal(
    await db
      .select({ state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, created.repost.id))
      .then(firstOrThrow)
      .then(({ state }) => state),
    PostState.DELETED,
  );
});

test('deletePost는 Author의 Repost를 Tombstone 처리하고 새 Repost를 허용한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const { repost } = await runRepost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });

  assert.deepEqual(await runDelete({ actorProfileId: actor.profile.id, postId: repost.id }), {
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

  const { repost: recreated } = await runRepost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });
  assert.notEqual(recreated.id, repost.id);
  assert.equal(recreated.state, PostState.ACTIVE);
});

test('deletePost의 반복·동시 호출은 최초 삭제 시각을 보존하며 멱등 성공한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);
  const { repost } = await runRepost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });
  const input = { actorProfileId: actor.profile.id, postId: repost.id };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => runDelete(input)));
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

  assert.deepEqual(await runDelete(input), { postId: repost.id });
  const repeatedDeletedAt = await db
    .select({ deletedAt: Posts.deletedAt })
    .from(Posts)
    .where(eq(Posts.id, repost.id))
    .then(firstOrThrow)
    .then(({ deletedAt }) => deletedAt);
  assert.equal(repeatedDeletedAt?.toString(), firstDeletedAt.toString());
});

test('deletePost는 pure Repost 구조가 아니면 Repost Notification cleanup을 만들지 않는다', async () => {
  const author = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const recipient = await createProfile();
  const created = await createPost({
    document: postContentDocumentFromText('remote post'),
    objectUri: `https://${author.instance.domain}/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: author.profile.id,
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    visibility: PostVisibility.PUBLIC,
  });
  assert.equal(created.created, true);
  await db.insert(Notifications).values({
    kind: NotificationKind.REPOST,
    recipientProfileId: recipient.profile.id,
    sourceId: created.post.id,
  });

  await runDelete({
    actorProfileId: author.profile.id,
    origin: 'ACTIVITYPUB',
    postId: created.post.id,
  });

  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(eq(Notifications.sourceId, created.post.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select({ state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, created.post.id))
      .then(firstOrThrow)
      .then(({ state }) => state),
    PostState.DELETED,
  );
});

test('deletePost는 다른 Author의 Post를 거부하고 누락 Post를 숨긴다', async () => {
  const author = await createProfile();
  const other = await createProfile();
  const post = await createContentPost(author.profile.id);

  await assert.rejects(
    runDelete({ actorProfileId: other.profile.id, postId: post.id }),
    (error) => error instanceof PermissionDeniedError && error.code === 'PERMISSION_DENIED',
  );
  await assert.rejects(
    runDelete({ actorProfileId: author.profile.id, postId: crypto.randomUUID() }),
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
  const { repost } = await runRepost({
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });

  await runDelete({ actorProfileId: actor.profile.id, postId: quote.id });

  const [deletedQuote, activeRepost] = await Promise.all([
    db.select().from(Posts).where(eq(Posts.id, quote.id)).then(firstOrThrow),
    db.select().from(Posts).where(eq(Posts.id, repost.id)).then(firstOrThrow),
  ]);
  assert.equal(deletedQuote.state, PostState.DELETED);
  assert.equal(deletedQuote.currentContentId, quote.currentContentId);
  assert.equal(activeRepost.state, PostState.ACTIVE);
});

test('deletePost는 자체 transaction에서 DB 실패를 rollback한다', async () => {
  const actor = await createProfile();
  const post = await createContentPost(actor.profile.id);

  await pg`
    create function fail_post_delete() returns trigger
    language plpgsql as $function$
    begin
      raise exception 'intentional post delete failure';
    end
    $function$
  `;
  await pg`
    create trigger fail_post_delete
    before update on post
    for each row execute function fail_post_delete()
  `;

  try {
    await assert.rejects(
      deletePostAction({
        actorProfileId: actor.profile.id,
        origin: 'LOCAL',
        postId: post.id,
      }),
      (error) =>
        error instanceof Error &&
        error.cause instanceof Error &&
        error.cause.message === 'intentional post delete failure',
    );
  } finally {
    await pg`drop trigger fail_post_delete on post`;
    await pg`drop function fail_post_delete()`;
  }

  const stored = await db
    .select({ deletedAt: Posts.deletedAt, state: Posts.state })
    .from(Posts)
    .where(eq(Posts.id, post.id))
    .then(firstOrThrow);
  assert.equal(stored.state, PostState.ACTIVE);
  assert.equal(stored.deletedAt, null);
});
