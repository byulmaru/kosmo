import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  pg,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost, repostPost } from './post';

after(async () => pg.end());

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
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
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  return { instance, profile };
};

const createActor = async (role: AccountProfileRole = AccountProfileRole.MEMBER) => {
  const { instance, profile } = await createProfile();
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      oidcSubject: suffix,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role,
  });

  return { account, instance, profile };
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
  const actor = await createActor();

  for (const sourceVisibility of [PostVisibility.PUBLIC, PostVisibility.UNLISTED]) {
    const source = await createContentPost(actor.profile.id, sourceVisibility);
    const repost = await repostPost({
      accountId: actor.account.id,
      actorProfileId: actor.profile.id,
      sourcePostId: source.id,
    });

    assert.equal(repost.profileId, actor.profile.id);
    assert.equal(repost.currentContentId, null);
    assert.equal(repost.repostSourceId, source.id);
    assert.equal(repost.state, PostState.ACTIVE);
    assert.equal(repost.visibility, PostVisibility.UNLISTED);
  }
});

test('repostPost는 자신의 Followers Only Source를 Followers Only로 생성한다', async () => {
  const actor = await createActor();
  const source = await createContentPost(actor.profile.id, PostVisibility.FOLLOWERS);

  const repost = await repostPost({
    accountId: actor.account.id,
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  });

  assert.equal(repost.visibility, PostVisibility.FOLLOWERS);
  assert.equal(repost.repostSourceId, source.id);
});

test('repostPost는 조회 가능한 허용 불가 Source를 sourceId VALIDATION으로 거부한다', async () => {
  const actor = await createActor();
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
        accountId: actor.account.id,
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
  const actor = await createActor();
  const author = await createProfile();
  const hidden = await createContentPost(author.profile.id, PostVisibility.FOLLOWERS);
  const tombstone = await createContentPost(author.profile.id);
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, tombstone.id));

  for (const sourcePostId of [crypto.randomUUID(), hidden.id, tombstone.id]) {
    await assert.rejects(
      repostPost({
        accountId: actor.account.id,
        actorProfileId: actor.profile.id,
        sourcePostId,
      }),
      (error) => error instanceof NotFoundError && error.code === 'NOT_FOUND',
    );
  }
});

test('repostPost는 Account membership과 Active/Normal Local actor를 검증한다', async () => {
  const sourceAuthor = await createProfile();
  const source = await createContentPost(sourceAuthor.profile.id);

  const ownerActor = await createActor(AccountProfileRole.OWNER);
  await repostPost({
    accountId: ownerActor.account.id,
    actorProfileId: ownerActor.profile.id,
    sourcePostId: source.id,
  });

  const adminActor = await createActor(AccountProfileRole.ADMIN);

  const disabledAccountActor = await createActor();
  await db
    .update(Accounts)
    .set({ state: AccountState.DISABLED })
    .where(eq(Accounts.id, disabledAccountActor.account.id));

  const missingMembershipActor = await createActor();
  await db
    .delete(AccountProfiles)
    .where(eq(AccountProfiles.accountId, missingMembershipActor.account.id));

  const disabledProfileActor = await createActor();
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, disabledProfileActor.profile.id));

  const remoteActor = await createActor();
  await db
    .update(Instances)
    .set({ kind: InstanceKind.ACTIVITYPUB })
    .where(eq(Instances.id, remoteActor.instance.id));

  for (const actor of [
    adminActor,
    disabledAccountActor,
    missingMembershipActor,
    disabledProfileActor,
    remoteActor,
  ]) {
    await assert.rejects(
      repostPost({
        accountId: actor.account.id,
        actorProfileId: actor.profile.id,
        sourcePostId: source.id,
      }),
      (error) => error instanceof PermissionDeniedError && error.code === 'PERMISSION_DENIED',
    );
  }
});

test('repostPost는 Quote의 전체 Source chain이 조회 가능할 때만 허용한다', async () => {
  const actor = await createActor();
  const base = await createContentPost(actor.profile.id);
  const quote = await createContentPost(actor.profile.id);
  await db.update(Posts).set({ repostSourceId: base.id }).where(eq(Posts.id, quote.id));

  const repost = await repostPost({
    accountId: actor.account.id,
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

  await assert.rejects(
    repostPost({
      accountId: actor.account.id,
      actorProfileId: actor.profile.id,
      sourcePostId: unavailableQuote.id,
    }),
    (error) => error instanceof NotFoundError,
  );
});

test('repostPost의 순차·동시 요청은 같은 Active Repost identity로 수렴한다', async () => {
  const actor = await createActor();
  const source = await createContentPost(actor.profile.id);
  const input = {
    accountId: actor.account.id,
    actorProfileId: actor.profile.id,
    sourcePostId: source.id,
  };

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => repostPost(input)));
  const first = concurrent[0]!;
  const repeated = await repostPost(input);

  assert.equal(repeated.id, first.id);
  assert.deepEqual(
    concurrent.map(({ id }) => id),
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
  const actor = await createActor();
  const source = await createContentPost(actor.profile.id);

  await assert.rejects(
    db.transaction(async (tx) => {
      await repostPost(
        {
          accountId: actor.account.id,
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
