import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg, Posts, Profiles, Reactions } from '../db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { reactionTypes } from '../validation';
import { addReaction } from './reaction';

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
    input: { actorProfileId: profile.id, postId: post.id },
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

test('여섯 built-in Type을 정확한 Unicode 문자열로 저장하고 서로 공존시킨다', async () => {
  const { input } = await createFixture();

  const results = [];
  for (const type of reactionTypes) {
    results.push(await addReaction({ ...input, type }));
  }

  assert.deepEqual(
    results.map(({ type }) => type),
    reactionTypes,
  );
  assert.equal(await countReactions(input.postId), reactionTypes.length);
});

test('허용되지 않은 Type은 field type validation 오류로 거부하고 저장하지 않는다', async () => {
  const { input } = await createFixture();

  for (const type of ['❤', '❤️\uFE0F', 'custom']) {
    await assert.rejects(
      addReaction({ ...input, type }),
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

  assert.equal(new Set(concurrent.map(({ id }) => id)).size, 1);
  assert.equal(repeated.id, concurrent[0]!.id);
  assert.equal(await countReactions(input.postId), 1);
});

test('활성 Local actor가 아니면 Reaction을 만들지 않는다', async () => {
  const fixtures = await Promise.all([
    createFixture({ instanceKind: InstanceKind.ACTIVITYPUB }),
    createFixture({ instanceState: InstanceState.SUSPENDED }),
    createFixture({ profileState: ProfileState.DISABLED }),
  ]);

  for (const { input } of fixtures) {
    await assert.rejects(addReaction({ ...input, type: '👀' }), PermissionDeniedError);
    assert.equal(await countReactions(input.postId), 0);
  }
});

test('활성 Post가 아니거나 actor 검증이 실패하면 Reaction을 만들지 않는다', async () => {
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

test('caller transaction이 rollback되면 추가한 Reaction도 남지 않는다', async () => {
  const { input } = await createFixture();

  await assert.rejects(
    db.transaction(async (tx) => {
      await addReaction({ ...input, type: '🌈' }, tx);
      throw new Error('rollback');
    }),
    /rollback/,
  );

  assert.equal(await countReactions(input.postId), 0);
});
