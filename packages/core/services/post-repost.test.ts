import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
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
import type { Transaction } from '../db';

const publicOrigin = 'http://127.0.0.1:4173';
process.env.PUBLIC_ORIGIN = publicOrigin;
let configuredLocalInstanceId: string;

before(async () => {
  const { seedDatabase } = await import('../db/seed');
  configuredLocalInstanceId = (await seedDatabase({ publicOrigin })).localInstance.id;
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

const createConfiguredLocalProfile = async () => {
  const suffix = crypto.randomUUID();
  return db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: configuredLocalInstanceId,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
};

const createRemoteFollower = async (followeeProfileId: string) => {
  const remote = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const actorUri = `https://${remote.instance.domain}/users/${remote.profile.id}`;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${actorUri}/inbox`,
    profileId: remote.profile.id,
    type: 'PERSON',
    uri: actorUri,
  });
  await db.insert(ProfileFollows).values({
    followeeProfileId,
    followerProfileId: remote.profile.id,
  });
};

const runRepost = async (
  input: { actorProfileId: string; origin?: 'LOCAL' | 'ACTIVITYPUB'; sourcePostId: string },
  tx?: Transaction,
) => {
  const result = await repostPostAction({ ...input, origin: input.origin ?? 'LOCAL' }, tx);
  if (!tx) {
    await result.postCommit();
  }
  return result;
};

const runDelete = async (
  input: { actorProfileId: string; origin?: 'LOCAL' | 'ACTIVITYPUB'; postId: string },
  tx?: Transaction,
) => {
  const result = await deletePostAction({ ...input, origin: input.origin ?? 'LOCAL' }, tx);
  if (!tx) {
    await result.postCommit();
  }
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

test('최초 top-level Repost 생성과 취소만 commit 뒤 Announce와 Undo를 전달한다', async () => {
  const actor = await createConfiguredLocalProfile();
  const recipient = await createConfiguredLocalProfile();
  const source = await createContentPost(recipient.id);
  await createRemoteFollower(actor.id);
  const { federation } = await import('@kosmo/fedify');
  const fixture = createDeliveryContextFixture();
  mock.method(federation, 'createContext', () => fixture.context);
  const input = { actorProfileId: actor.id, sourcePostId: source.id };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => runRepost(input)));
  const repost = concurrent.find(({ created }) => created)?.repost;
  assert.ok(repost);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0]?.constructor.name, 'Announce');
  assert.equal(
    await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(
        and(eq(Notifications.kind, NotificationKind.REPOST), eq(Notifications.sourceId, repost.id)),
      )
      .then((rows) => rows.length),
    1,
  );

  await runRepost(input);
  assert.equal(fixture.calls.length, 1);
  assert.equal(
    await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(
        and(eq(Notifications.kind, NotificationKind.REPOST), eq(Notifications.sourceId, repost.id)),
      )
      .then((rows) => rows.length),
    1,
  );

  const deleteInput = { actorProfileId: actor.id, postId: repost.id };
  await Promise.all(Array.from({ length: 4 }, () => runDelete(deleteInput)));
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[1]?.constructor.name, 'Undo');

  await runDelete(deleteInput);
  assert.equal(fixture.calls.length, 2);

  const rollbackSource = await createContentPost(actor.id);
  await assert.rejects(
    db.transaction(async (tx) => {
      await runRepost({ actorProfileId: actor.id, sourcePostId: rollbackSource.id }, tx);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(fixture.calls.length, 2);

  const remoteActor = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  await runRepost({
    actorProfileId: remoteActor.profile.id,
    origin: 'ACTIVITYPUB',
    sourcePostId: source.id,
  });
  assert.equal(fixture.calls.length, 2);

  const ordinaryPost = await createContentPost(actor.id);
  await runDelete({ actorProfileId: actor.id, postId: ordinaryPost.id });
  assert.equal(fixture.calls.length, 2);
});

test('Local·ActivityPub origin과 top-level·caller transaction 모두 같은 Repost lifecycle을 사용한다', async () => {
  const recipient = await createConfiguredLocalProfile();
  const source = await createContentPost(recipient.id);
  const localActor = await createConfiguredLocalProfile();
  const remoteActor = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });

  for (const [origin, actorProfileId] of [
    ['LOCAL', localActor.id],
    ['ACTIVITYPUB', remoteActor.profile.id],
  ] as const) {
    const topLevel = await repostPostAction({ actorProfileId, origin, sourcePostId: source.id });
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, topLevel.repost.id)), 0);
    const firstPostCommit = topLevel.postCommit();
    assert.equal(topLevel.postCommit(), firstPostCommit);
    await firstPostCommit;
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, topLevel.repost.id)), 1);

    const duplicate = await repostPostAction({ actorProfileId, origin, sourcePostId: source.id });
    assert.equal(duplicate.created, false);
    await duplicate.postCommit();
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, topLevel.repost.id)), 1);

    const deleted = await deletePostAction({ actorProfileId, origin, postId: topLevel.repost.id });
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, topLevel.repost.id)), 1);
    const deletePostCommit = deleted.postCommit();
    assert.equal(deleted.postCommit(), deletePostCommit);
    await deletePostCommit;
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, topLevel.repost.id)), 0);

    const callerTx = await db.transaction(async (tx) => {
      const created = await repostPostAction(
        { actorProfileId, origin, sourcePostId: source.id },
        tx,
      );
      assert.equal(
        await db.$count(Notifications, eq(Notifications.sourceId, created.repost.id)),
        0,
      );
      return created;
    });
    await callerTx.postCommit();
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, callerTx.repost.id)), 1);

    const callerTxDelete = await db.transaction(async (tx) => {
      const deleted = await deletePostAction(
        { actorProfileId, origin, postId: callerTx.repost.id },
        tx,
      );
      assert.equal(
        await db.$count(Notifications, eq(Notifications.sourceId, callerTx.repost.id)),
        1,
      );
      return deleted;
    });
    await callerTxDelete.postCommit();
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, callerTx.repost.id)), 0);
  }
});

test('caller transaction rollback 뒤 postCommit을 실행해도 Repost lifecycle이 materialize되지 않는다', async () => {
  const actor = await createConfiguredLocalProfile();
  const source = await createContentPost(actor.id);
  let created: Awaited<ReturnType<typeof repostPostAction>> | undefined;

  await assert.rejects(
    db.transaction(async (tx) => {
      created = await repostPostAction(
        { actorProfileId: actor.id, origin: 'LOCAL', sourcePostId: source.id },
        tx,
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );

  assert.ok(created);
  await assert.doesNotReject(created.postCommit());
  assert.equal(
    await db.$count(Posts, and(eq(Posts.profileId, actor.id), eq(Posts.repostSourceId, source.id))),
    0,
  );
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, created.repost.id)), 0);
});

test('Repost Notification 실패가 committed Repost 상태와 postCommit 후속 실행을 격리한다', async () => {
  const actor = await createConfiguredLocalProfile();
  const recipient = await createConfiguredLocalProfile();
  const source = await createContentPost(recipient.id);
  await db.execute(
    sql`ALTER TABLE ${Notifications} ADD CONSTRAINT notification_repost_post_commit_failure CHECK (false) NOT VALID`,
  );
  try {
    const result = await repostPostAction({
      actorProfileId: actor.id,
      origin: 'LOCAL',
      sourcePostId: source.id,
    });
    await assert.doesNotReject(result.postCommit());
    assert.equal(
      await db
        .select({ state: Posts.state })
        .from(Posts)
        .where(eq(Posts.id, result.repost.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      PostState.ACTIVE,
    );
  } finally {
    await db.execute(
      sql`ALTER TABLE ${Notifications} DROP CONSTRAINT notification_repost_post_commit_failure`,
    );
  }
});

test('post-commit Repost delivery 실패는 committed 생성과 취소 결과를 바꾸지 않는다', async () => {
  const actor = await createConfiguredLocalProfile();
  const source = await createContentPost(actor.id);
  await createRemoteFollower(actor.id);
  const { federation } = await import('@kosmo/fedify');
  const context = {
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async () => {
      throw new Error('delivery failed');
    },
  } as never;
  mock.method(federation, 'createContext', () => context);
  const errorLog = mock.method(console, 'error', () => undefined);

  const result = await runRepost({ actorProfileId: actor.id, sourcePostId: source.id });
  assert.equal(result.created, true);
  assert.equal(
    await db
      .select({ state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, result.repost.id))
      .then(firstOrThrow)
      .then(({ state }) => state),
    PostState.ACTIVE,
  );

  assert.deepEqual(await runDelete({ actorProfileId: actor.id, postId: result.repost.id }), {
    postId: result.repost.id,
  });
  assert.equal(
    await db
      .select({ state: Posts.state })
      .from(Posts)
      .where(eq(Posts.id, result.repost.id))
      .then(firstOrThrow)
      .then(({ state }) => state),
    PostState.DELETED,
  );
  assert.deepEqual(
    errorLog.mock.calls.map(({ arguments: [message] }) => message),
    [
      'Post-commit ActivityPub Repost Announce delivery failed',
      'Post-commit ActivityPub Repost Undo delivery failed',
    ],
  );
});

test('repostPost는 caller transaction rollback에 합류한다', async () => {
  const actor = await createProfile();
  const source = await createContentPost(actor.profile.id);

  await assert.rejects(
    db.transaction(async (tx) => {
      await runRepost(
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

test('deletePost는 caller transaction rollback에 합류한다', async () => {
  const actor = await createProfile();
  const post = await createContentPost(actor.profile.id);

  await assert.rejects(
    db.transaction(async (tx) => {
      await runDelete({ actorProfileId: actor.profile.id, postId: post.id }, tx);
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

const createDeliveryContextFixture = () => {
  const calls: { readonly constructor: { readonly name: string } }[] = [];
  const context = {
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async (
      _sender: { identifier: string },
      _recipients: unknown,
      activity: { readonly constructor: { readonly name: string } },
    ) => {
      calls.push(activity);
    },
  } as never;
  return { calls, context };
};
