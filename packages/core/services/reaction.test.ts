import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { db, firstOrThrow, Instances, Notifications, pg, Posts, Profiles, Reactions } from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { temporalClient } from '../temporal/client';
import { REACTION_CREATE_WORKFLOW_TYPE } from '../temporal/reaction-create';
import { REACTION_DELETE_WORKFLOW_TYPE } from '../temporal/reaction-delete';
import { reactionTypes } from '../validation';
import { addReaction, deleteReaction } from './reaction';

after(async () => {
  await pg.end();
});

const createFixture = async ({
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  postState = PostState.ACTIVE,
  profileState = ProfileState.ACTIVE,
  canonicalOrigin,
}: {
  canonicalOrigin?: string | null;
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  postState?: PostState;
  profileState?: ProfileState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin,
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
  const post = await db
    .insert(Posts)
    .values({
      profileId: profile.id,
      state: postState,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

  return {
    input: { actorProfileId: profile.id, origin: 'LOCAL' as const, postId: post.id },
    post,
    profile,
  };
};

const countReactions = (postId: string) =>
  db
    .select()
    .from(Reactions)
    .where(eq(Reactions.postId, postId))
    .then((rows) => rows.length);

const countReactionNotifications = (sourceId: string) =>
  db
    .select()
    .from(Notifications)
    .where(
      and(eq(Notifications.kind, NotificationKind.REACTION), eq(Notifications.sourceId, sourceId)),
    )
    .then((rows) => rows.length);

const assertDeleteResult = (
  result: Awaited<ReturnType<typeof deleteReaction>>,
  expected: { readonly postId: string; readonly reaction: typeof Reactions.$inferSelect | null },
) => {
  assert.deepEqual({ postId: result.postId, reaction: result.reaction }, expected);
};

test('여섯 built-in Type을 정확한 Unicode 문자열로 저장하고 서로 공존시킨다', async () => {
  const { input } = await createFixture();

  const results = [];
  for (const type of reactionTypes) {
    results.push((await addReaction({ ...input, type })).reaction);
  }

  assert.deepEqual(
    results.map(({ type }) => type),
    reactionTypes,
  );
  assert.equal(await countReactions(input.postId), reactionTypes.length);
});

test('허용되지 않은 Type은 추가·삭제에서 field type validation 오류로 거부한다', async () => {
  const { input } = await createFixture();

  for (const type of ['❤', '❤️\uFE0F', 'custom']) {
    await assert.rejects(
      addReaction({ ...input, type }),
      (error: unknown) =>
        error instanceof ValidationError && error.code === 'VALIDATION' && error.field === 'type',
    );
    await assert.rejects(
      deleteReaction({
        actorProfileId: input.actorProfileId,
        origin: 'LOCAL',
        postId: input.postId,
        type,
      }),
      (error: unknown) =>
        error instanceof ValidationError && error.code === 'VALIDATION' && error.field === 'type',
    );
  }

  assert.equal(await countReactions(input.postId), 0);
});

test('반복·동시 추가는 하나의 Reaction을 반환한다', async () => {
  const { input } = await createFixture();

  const concurrent = await Promise.all(
    Array.from({ length: 4 }, () => addReaction({ ...input, type: '🎉' })),
  );
  const repeated = await addReaction({ ...input, type: '🎉' });

  assert.equal(new Set(concurrent.map(({ reaction }) => reaction.id)).size, 1);
  assert.equal(repeated.reaction.id, concurrent[0]!.reaction.id);
  assert.equal(await countReactions(input.postId), 1);
});

test('addReaction 결과는 새 source만 구분한다', async () => {
  const { input } = await createFixture();
  const first = await addReaction({ ...input, type: '🎉' });
  const repeated = await addReaction({ ...input, type: '🎉' });

  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.reaction.id, first.reaction.id);
});

test('core는 entry에서 검증된 actor의 Profile/Instance 상태를 다시 조회하지 않는다', async () => {
  const fixtures = await Promise.all([
    createFixture({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.UNRESPONSIVE,
    }),
    createFixture({
      instanceKind: InstanceKind.ACTIVITYPUB,
      instanceState: InstanceState.SUSPENDED,
    }),
    createFixture({ profileState: ProfileState.DISABLED }),
  ]);

  for (const fixture of fixtures) {
    const { reaction } = await addReaction({ ...fixture.input, type: '👀' });
    assert.equal(await countReactions(fixture.input.postId), 1);
    await deleteReaction({
      actorProfileId: fixture.profile.id,
      origin: 'LOCAL',
      postId: fixture.post.id,
      type: reaction.type,
    });
    assert.equal(await countReactions(fixture.input.postId), 0);
  }
});

test('활성 Post가 아니면 Reaction을 만들지 않는다', async () => {
  const deletedPost = await createFixture({ postState: PostState.DELETED });
  await assert.rejects(addReaction({ ...deletedPost.input, type: '☘️' }), NotFoundError);
  assert.equal(await countReactions(deletedPost.post.id), 0);

  const actor = await createFixture();
  await assert.rejects(
    addReaction({ ...actor.input, postId: crypto.randomUUID(), type: '🌈' }),
    NotFoundError,
  );
  assert.equal(
    await db
      .select()
      .from(Reactions)
      .where(and(eq(Reactions.profileId, actor.profile.id), eq(Reactions.type, '🌈')))
      .then((rows) => rows.length),
    0,
  );
});

test('실제 Reaction 생성 commit 뒤에만 Create Effects Workflow를 시작한다', async () => {
  const actor = await createFixture();
  const recipient = await createFixture();
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    const created = await addReaction({
      actorProfileId: actor.profile.id,
      origin: 'LOCAL',
      postId: recipient.post.id,
      type: '🥹',
    });
    const duplicate = await addReaction({
      actorProfileId: actor.profile.id,
      origin: 'LOCAL',
      postId: recipient.post.id,
      type: '🥹',
    });

    assert.equal(created.created, true);
    assert.equal(duplicate.created, false);
    assert.equal(start.mock.callCount(), 1);
    assert.equal(start.mock.calls[0]?.arguments[0], REACTION_CREATE_WORKFLOW_TYPE);
    assert.deepEqual(start.mock.calls[0]?.arguments[1]?.args, [
      { origin: 'LOCAL', reactionId: created.reaction.id },
    ]);
  } finally {
    start.mock.restore();
  }
});

test('ActivityPub origin의 실제 Reaction 생성은 outbound echo 없이 Workflow만 시작한다', async () => {
  const actor = await createFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const recipient = await createFixture();
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    const result = await addReaction({
      actorProfileId: actor.profile.id,
      origin: 'ACTIVITYPUB',
      postId: recipient.post.id,
      type: '🥹',
    });

    assert.equal(start.mock.callCount(), 1);
    assert.deepEqual(start.mock.calls[0]?.arguments[1]?.args, [
      { origin: 'ACTIVITYPUB', reactionId: result.reaction.id },
    ]);
    assert.equal(await countReactionNotifications(result.reaction.id), 0);
  } finally {
    start.mock.restore();
  }
});

test('commit 뒤 Workflow start 실패는 committed Reaction과 caller 성공을 바꾸지 않는다', async () => {
  const actor = await createFixture();
  const recipient = await createFixture();
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    throw new Error('Temporal unavailable');
  });
  const errorLog = mock.method(console, 'error', () => undefined);

  try {
    const result = await addReaction({
      actorProfileId: actor.profile.id,
      origin: 'LOCAL',
      postId: recipient.post.id,
      type: '🎉',
    });

    assert.equal(result.created, true);
    assert.equal(await countReactions(recipient.post.id), 1);
    assert.equal(
      errorLog.mock.calls[0]?.arguments[0],
      'Reaction Create effects Workflow start failed',
    );
  } finally {
    start.mock.restore();
    errorLog.mock.restore();
  }
});

test('실제 Reaction 삭제 commit은 삭제 snapshot으로 Delete Effects Workflow를 시작하고 no-op은 시작하지 않는다', async () => {
  const actor = await createFixture();
  const recipient = await createFixture();
  const created = await addReaction({
    actorProfileId: actor.profile.id,
    origin: 'LOCAL',
    postId: recipient.post.id,
    type: '☘️',
  });
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    const deleted = await deleteReaction({
      actorProfileId: actor.profile.id,
      origin: 'LOCAL',
      postId: recipient.post.id,
      type: created.reaction.type,
    });
    const repeated = await deleteReaction({
      actorProfileId: actor.profile.id,
      origin: 'LOCAL',
      postId: recipient.post.id,
      type: created.reaction.type,
    });

    assert.equal(deleted.reaction?.id, created.reaction.id);
    assert.equal(repeated.reaction, null);
    assert.equal(start.mock.callCount(), 1);
    assert.equal(start.mock.calls[0]?.arguments[0], REACTION_DELETE_WORKFLOW_TYPE);
    assert.deepEqual(start.mock.calls[0]?.arguments[1]?.args, [
      {
        createdAt: created.reaction.createdAt.toString(),
        id: created.reaction.id,
        origin: 'LOCAL',
        postId: created.reaction.postId,
        profileId: created.reaction.profileId,
        type: created.reaction.type,
      },
    ]);
  } finally {
    start.mock.restore();
  }
});

test('expected Reaction ID가 다르면 교체된 같은 Type을 삭제하지 않는다', async () => {
  const fixture = await createFixture();
  const { reaction } = await addReaction({ ...fixture.input, type: '👀' });

  const result = await deleteReaction({
    actorProfileId: fixture.profile.id,
    expectedReactionId: crypto.randomUUID(),
    origin: 'ACTIVITYPUB',
    postId: fixture.post.id,
    type: reaction.type,
  });

  assertDeleteResult(result, { postId: fixture.post.id, reaction: null });
  assert.equal(await countReactions(fixture.post.id), 1);
});

test('Owner는 Post가 unavailable해져도 Post와 Type으로 Reaction을 삭제한다', async () => {
  const fixture = await createFixture();
  const { reaction } = await addReaction({ ...fixture.input, type: '❤️' });
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, fixture.post.id));

  const result = await deleteReaction({
    actorProfileId: fixture.profile.id,
    origin: 'LOCAL',
    postId: fixture.post.id,
    type: reaction.type,
  });

  assertDeleteResult(result, { postId: fixture.post.id, reaction });
  assert.equal(await countReactions(fixture.post.id), 0);
});

test('반복·동시 삭제는 하나만 삭제 ID를 반환하고 나머지는 no-op으로 끝난다', async () => {
  const fixture = await createFixture();
  const { reaction } = await addReaction({ ...fixture.input, type: '🎉' });
  const input = {
    actorProfileId: fixture.profile.id,
    origin: 'LOCAL' as const,
    postId: fixture.post.id,
    type: reaction.type,
  };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => deleteReaction(input)));
  const repeated = await deleteReaction(input);

  assert.equal(concurrent.filter(({ reaction: deleted }) => deleted?.id === reaction.id).length, 1);
  assert.equal(concurrent.filter(({ reaction: deleted }) => deleted === null).length, 3);
  assertDeleteResult(repeated, { postId: fixture.post.id, reaction: null });
  assert.equal(await countReactions(fixture.post.id), 0);
});

test('없는 조합은 no-op이고 오래된 Post/Type 재시도는 재생성된 Reaction을 제거한다', async () => {
  const fixture = await createFixture();
  const missing = await deleteReaction({
    actorProfileId: fixture.profile.id,
    origin: 'LOCAL',
    postId: fixture.post.id,
    type: '👀',
  });
  assertDeleteResult(missing, { postId: fixture.post.id, reaction: null });

  const { reaction: first } = await addReaction({ ...fixture.input, type: '👀' });
  await deleteReaction({
    actorProfileId: fixture.profile.id,
    origin: 'LOCAL',
    postId: fixture.post.id,
    type: first.type,
  });
  const { reaction: recreated } = await addReaction({ ...fixture.input, type: '👀' });
  const staleRetry = await deleteReaction({
    actorProfileId: fixture.profile.id,
    origin: 'LOCAL',
    postId: fixture.post.id,
    type: first.type,
  });

  assert.notEqual(recreated.id, first.id);
  assertDeleteResult(staleRetry, { postId: fixture.post.id, reaction: recreated });
  assert.deepEqual(await db.select().from(Reactions).where(eq(Reactions.id, recreated.id)), []);
});

test('다른 Profile의 Reaction은 삭제하지 않는다', async () => {
  const owner = await createFixture();
  const attacker = await createFixture();
  const { reaction } = await addReaction({ ...owner.input, type: '🌈' });

  const result = await deleteReaction({
    actorProfileId: attacker.profile.id,
    origin: 'LOCAL',
    postId: owner.post.id,
    type: reaction.type,
  });
  assertDeleteResult(result, { postId: owner.post.id, reaction: null });
  assert.deepEqual(await db.select().from(Reactions).where(eq(Reactions.id, reaction.id)), [
    reaction,
  ]);
});
