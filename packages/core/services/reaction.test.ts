import assert from 'node:assert/strict';
import { after, test } from 'node:test';
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
import { reactionTypes } from '../validation';
import { createReactionNotification } from './notification';
import { addReaction, deleteReaction } from './reaction';

after(async () => {
  await pg.end();
});

const createFixture = async ({
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  postState = PostState.ACTIVE,
  profileState = ProfileState.ACTIVE,
}: {
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  postState?: PostState;
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

test('Local과 ActivityPub origin은 caller transaction에 독립적으로 참여한다', async () => {
  for (const origin of ['LOCAL', 'ACTIVITYPUB'] as const) {
    const { input } = await createFixture({
      instanceKind: origin === 'LOCAL' ? InstanceKind.LOCAL : InstanceKind.ACTIVITYPUB,
    });
    let reactionId: string | undefined;

    await assert.rejects(
      db.transaction(async (tx) => {
        reactionId = (await addReaction({ ...input, origin, type: '🌈' }, tx)).reaction.id;
        throw new Error('rollback');
      }),
      /rollback/,
    );

    assert.ok(reactionId);
    assert.equal(await countReactions(input.postId), 0);
    assert.equal(await countReactionNotifications(reactionId), 0);
  }
});

test('top-level ActivityPub origin은 Notification만 commit 후 생성한다', async () => {
  const actor = await createFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const recipient = await createFixture();

  const { reaction } = await addReaction({
    actorProfileId: actor.profile.id,
    origin: 'ACTIVITYPUB',
    postId: recipient.post.id,
    type: '🥹',
  });

  assert.equal(await countReactionNotifications(reaction.id), 1);
});

test('Local과 ActivityPub 삭제는 caller transaction에 독립적으로 참여한다', async () => {
  for (const origin of ['LOCAL', 'ACTIVITYPUB'] as const) {
    const actor = await createFixture({
      instanceKind: origin === 'LOCAL' ? InstanceKind.LOCAL : InstanceKind.ACTIVITYPUB,
    });
    const recipient = await createFixture();
    const { reaction } = await addReaction({
      actorProfileId: actor.profile.id,
      origin: 'ACTIVITYPUB',
      postId: recipient.post.id,
      type: '☘️',
    });
    assert.equal(await countReactionNotifications(reaction.id), 1);

    await assert.rejects(
      db.transaction(async (tx) => {
        const deleted = await deleteReaction(
          {
            actorProfileId: actor.profile.id,
            origin,
            postId: recipient.post.id,
            type: reaction.type,
          },
          tx,
        );
        assert.equal(deleted.reaction?.id, reaction.id);
        throw new Error('rollback');
      }),
      /rollback/,
    );

    assert.equal(await countReactions(recipient.post.id), 1);
    assert.equal(await countReactionNotifications(reaction.id), 1);
  }
});

test('top-level ActivityPub 삭제는 Notification만 commit 후 정리한다', async () => {
  const actor = await createFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const recipient = await createFixture();
  const { reaction } = await addReaction({
    actorProfileId: actor.profile.id,
    origin: 'ACTIVITYPUB',
    postId: recipient.post.id,
    type: '🥹',
  });

  const deleted = await deleteReaction({
    actorProfileId: actor.profile.id,
    origin: 'ACTIVITYPUB',
    postId: recipient.post.id,
    type: reaction.type,
  });

  assert.equal(deleted.reaction?.id, reaction.id);
  assert.equal(await countReactionNotifications(reaction.id), 0);
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

  assert.deepEqual(result, { postId: fixture.post.id, reaction: null });
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

  assert.deepEqual(result, { postId: fixture.post.id, reaction });
  assert.equal(await countReactions(fixture.post.id), 0);
});

test('Reaction 삭제는 실제 삭제된 ID의 Notification만 정리한다', async () => {
  const author = await createFixture();
  const recipient = await createFixture();
  const { reaction } = await addReaction({
    actorProfileId: author.profile.id,
    origin: 'LOCAL',
    postId: recipient.post.id,
    type: '🎉',
  });
  await createReactionNotification(reaction.id);

  assert.equal(await countReactionNotifications(reaction.id), 1);
  const deleted = await deleteReaction({
    actorProfileId: author.profile.id,
    origin: 'LOCAL',
    postId: recipient.post.id,
    type: reaction.type,
  });
  assert.deepEqual(deleted, { postId: recipient.post.id, reaction });
  assert.equal(await countReactionNotifications(reaction.id), 0);

  await db.insert(Notifications).values({
    kind: NotificationKind.REACTION,
    recipientProfileId: recipient.profile.id,
    sourceId: reaction.id,
  });
  assert.equal(await countReactionNotifications(reaction.id), 1);

  const repeated = await deleteReaction({
    actorProfileId: author.profile.id,
    origin: 'LOCAL',
    postId: recipient.post.id,
    type: reaction.type,
  });
  assert.deepEqual(repeated, { postId: recipient.post.id, reaction: null });
  assert.equal(await countReactionNotifications(reaction.id), 1);
});

test('Notification cleanup 실패에도 Reaction 삭제 성공과 오류 관측을 유지한다', async () => {
  const author = await createFixture();
  const recipient = await createFixture();
  const { reaction } = await addReaction({
    actorProfileId: author.profile.id,
    origin: 'LOCAL',
    postId: recipient.post.id,
    type: '👀',
  });
  await createReactionNotification(reaction.id);

  await pg.unsafe(`
    CREATE FUNCTION fail_reaction_notification_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF OLD.kind = 'REACTION' THEN RAISE EXCEPTION 'forced notification cleanup failure'; END IF;
      RETURN OLD;
    END $$;
    CREATE TRIGGER fail_reaction_notification_delete
    BEFORE DELETE ON notification
    FOR EACH ROW EXECUTE FUNCTION fail_reaction_notification_delete();
  `);

  const originalConsoleError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args) => {
    errors.push(args);
  };

  try {
    const result = await deleteReaction({
      actorProfileId: author.profile.id,
      origin: 'LOCAL',
      postId: recipient.post.id,
      type: reaction.type,
    });

    assert.deepEqual(result, { postId: recipient.post.id, reaction });
    assert.equal(await countReactions(recipient.post.id), 0);
    assert.equal(await countReactionNotifications(reaction.id), 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.[0], 'Failed to clean up Reaction Notification');
    assert.equal((errors[0]?.[1] as { reactionId?: string } | undefined)?.reactionId, reaction.id);
    assert.ok((errors[0]?.[1] as { error?: unknown } | undefined)?.error);
  } finally {
    console.error = originalConsoleError;
    await pg.unsafe(`
      DROP TRIGGER IF EXISTS fail_reaction_notification_delete ON notification;
      DROP FUNCTION IF EXISTS fail_reaction_notification_delete();
    `);
  }
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
  assert.deepEqual(repeated, { postId: fixture.post.id, reaction: null });
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
  assert.deepEqual(missing, { postId: fixture.post.id, reaction: null });

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
  assert.deepEqual(staleRetry, { postId: fixture.post.id, reaction: recreated });
  assert.deepEqual(await db.select().from(Reactions).where(eq(Reactions.id, recreated.id)), []);
});

test('다른 Profile의 Reaction은 삭제하지 않는다', async () => {
  const owner = await createFixture();
  const attacker = await createFixture();
  const { reaction } = await addReaction({ ...owner.input, type: '🌈' });

  assert.deepEqual(
    await deleteReaction({
      actorProfileId: attacker.profile.id,
      origin: 'LOCAL',
      postId: owner.post.id,
      type: reaction.type,
    }),
    { postId: owner.post.id, reaction: null },
  );
  assert.deepEqual(await db.select().from(Reactions).where(eq(Reactions.id, reaction.id)), [
    reaction,
  ]);
});
