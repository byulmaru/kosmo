import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreServices from '@kosmo/core/services';
import type { deriveContext as deriveContextFunction, Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let Sessions: typeof CoreDb.Sessions;
let createCorePost: typeof CoreServices.createPost;
let repostPost: typeof CoreServices.repostPost;
let app: Hono<Env>;
let deriveContext: typeof deriveContextFunction;
let localInstanceId: string;
let loaderBatches = new Map<string, number[]>();

const trackLoaderBatches = <Context extends Awaited<ReturnType<typeof deriveContext>>>(
  context: Context,
) => {
  const originalLoader = context.loader;
  context.loader = ((params: { name: string; load: (keys: unknown[]) => Promise<unknown[]> }) =>
    originalLoader({
      ...params,
      load: async (keys: unknown[]) => {
        const keyCounts = loaderBatches.get(params.name) ?? [];
        keyCounts.push(keys.length);
        loaderBatches.set(params.name, keyCounts);
        return params.load(keys);
      },
    } as never)) as typeof context.loader;
  return context;
};

describe('GraphQL Reaction', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ createPost: createCorePost, repostPost } = await import('@kosmo/core/services'));
    ({
      AccountProfiles,
      Accounts,
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      Notifications,
      pg,
      PostContents,
      Posts,
      Profiles,
      Reactions,
      Sessions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = await import('@kosmo/core/db/seed');

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    const { yoga } = await import('../../../src/graphql');
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', trackLoaderBatches(await deriveContext(c)));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
    loaderBatches = new Map();
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('반복 add가 같은 Reaction Node를 반환하고 created를 노출하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);

    const first = await requestAddReaction(post.id, '❤️', auth.token);
    const second = await requestAddReaction(post.id, '❤️', auth.token);

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(second);
    assert.deepEqual(second.data?.addReaction.reaction, first.data?.addReaction.reaction);
    const stored = await db
      .select()
      .from(Reactions)
      .where(eq(Reactions.postId, post.id))
      .then(firstOrThrow);
    assert.deepEqual(first.data?.addReaction.reaction, {
      __typename: 'Reaction',
      createdAt: first.data?.addReaction.reaction.createdAt,
      id: globalId('Reaction', stored.id),
      type: '❤️',
    });
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      1,
    );
  });

  test('새 Reaction은 타인 소유 Local Post에 알림을 한 번만 생성한다', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile(`recipient-${crypto.randomUUID()}`);
    const post = await createPost(recipient.id);

    await requestAddReaction(post.id, '🎉', auth.token);
    await requestAddReaction(post.id, '🎉', auth.token);

    const [reaction] = await db.select().from(Reactions).where(eq(Reactions.postId, post.id));
    assert.ok(reaction);
    assert.deepEqual(
      await db
        .select({
          kind: Notifications.kind,
          recipientProfileId: Notifications.recipientProfileId,
          sourceId: Notifications.sourceId,
        })
        .from(Notifications),
      [
        {
          kind: NotificationKind.REACTION,
          recipientProfileId: recipient.id,
          sourceId: reaction.id,
        },
      ],
    );
  });

  test('Notification 저장 실패는 Reaction 성공을 rollback하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile(`recipient-${crypto.randomUUID()}`);
    const post = await createPost(recipient.id);

    await pg.unsafe(`
      CREATE FUNCTION fail_reaction_notification_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.kind = 'REACTION' THEN RAISE EXCEPTION 'forced notification failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_reaction_notification_insert
      BEFORE INSERT ON notification
      FOR EACH ROW EXECUTE FUNCTION fail_reaction_notification_insert();
    `);

    try {
      const result = await requestAddReaction(post.id, '👀', auth.token);
      assertNoGraphQLErrors(result);
      assert.equal(await db.$count(Reactions), 1);
      assert.equal(await db.$count(Notifications), 0);
    } finally {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_reaction_notification_insert ON notification;
        DROP FUNCTION IF EXISTS fail_reaction_notification_insert();
      `);
    }
  });

  test('Active Remote Post의 실제 create/delete만 post-commit delivery를 시도한다', async () => {
    const auth = await createAuthenticatedSession();
    const target = await createRemoteReactionTarget({ inboxUri: 'not a valid inbox URI' });
    const errorLog = mock.method(console, 'error', () => undefined);

    try {
      const added = await requestAddReaction(target.post.id, '❤️', auth.token);
      const duplicate = await requestAddReaction(target.post.id, '❤️', auth.token);
      assertNoGraphQLErrors(added);
      assertNoGraphQLErrors(duplicate);
      assert.equal(duplicate.data?.addReaction.reaction.id, added.data?.addReaction.reaction.id);
      assert.equal(errorLog.mock.callCount(), 1);
      assert.equal(
        errorLog.mock.calls[0]?.arguments[0],
        'Post-commit ActivityPub Reaction delivery failed',
      );
      assert.equal(await db.$count(Reactions), 1);
      assert.equal(await db.$count(Notifications), 0);

      const deleted = await requestDeleteReaction(target.post.id, '❤️', auth.token);
      const repeated = await requestDeleteReaction(target.post.id, '❤️', auth.token);
      assertNoGraphQLErrors(deleted);
      assertNoGraphQLErrors(repeated);
      assert.equal(deleted.data?.deleteReaction.reactionId, added.data?.addReaction.reaction.id);
      assert.equal(repeated.data?.deleteReaction.reactionId, null);
      assert.equal(errorLog.mock.callCount(), 2);
      assert.equal(
        errorLog.mock.calls[1]?.arguments[0],
        'Post-commit ActivityPub Reaction Undo delivery failed',
      );
      assert.equal(await db.$count(Reactions), 0);
      assert.equal(await db.$count(Notifications), 0);
    } finally {
      errorLog.mock.restore();
    }
  });

  test('Reaction transaction이 rollback되면 delivery를 시도하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const target = await createRemoteReactionTarget({ inboxUri: 'not a valid inbox URI' });
    await pg.unsafe(`
      CREATE FUNCTION fail_reaction_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'forced reaction rollback';
      END $$;
      CREATE TRIGGER fail_reaction_insert
      BEFORE INSERT ON reaction
      FOR EACH ROW EXECUTE FUNCTION fail_reaction_insert();
    `);
    const errorLog = mock.method(console, 'error', () => undefined);

    let result: Awaited<ReturnType<typeof requestAddReaction>>;
    try {
      result = await requestAddReaction(target.post.id, '🥹', auth.token);
    } finally {
      errorLog.mock.restore();
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_reaction_insert ON reaction;
        DROP FUNCTION IF EXISTS fail_reaction_insert();
      `);
    }

    assert.ok(result.errors?.[0]);
    assert.equal(await db.$count(Reactions), 0);
    assert.equal(
      errorLog.mock.calls.filter(
        ({ arguments: [message] }) =>
          message === 'Post-commit ActivityPub Reaction delivery failed',
      ).length,
      0,
    );
  });

  test('Local Post, non-local sender와 UNRESPONSIVE target에는 delivery를 시도하지 않는다', async () => {
    const localAuth = await createAuthenticatedSession();
    const localPost = await createPost(localAuth.profile.id);
    const unresponsiveTarget = await createRemoteReactionTarget({
      inboxUri: 'not a valid inbox URI',
      state: InstanceState.UNRESPONSIVE,
    });
    const remoteSenderInstance = await createRemoteInstance({ state: InstanceState.ACTIVE });
    const remoteAuth = await createAuthenticatedSession({ instanceId: remoteSenderInstance.id });
    const activeTarget = await createRemoteReactionTarget({ inboxUri: 'not a valid inbox URI' });
    const errorLog = mock.method(console, 'error', () => undefined);

    try {
      for (const [auth, post] of [
        [localAuth, localPost],
        [localAuth, unresponsiveTarget.post],
        [remoteAuth, activeTarget.post],
      ] as const) {
        const added = await requestAddReaction(post.id, '🎉', auth.token);
        const deleted = await requestDeleteReaction(post.id, '🎉', auth.token);
        assertNoGraphQLErrors(added);
        assertNoGraphQLErrors(deleted);
      }

      assert.equal(errorLog.mock.callCount(), 0);
      assert.equal(await db.$count(Reactions), 0);
    } finally {
      errorLog.mock.restore();
    }
  });

  test('SUSPENDED target add는 숨기고 기존 Reaction delete는 Undo 없이 commit한다', async () => {
    const auth = await createAuthenticatedSession();
    const target = await createRemoteReactionTarget({
      inboxUri: 'not a valid inbox URI',
      state: InstanceState.UNRESPONSIVE,
    });
    const added = await requestAddReaction(target.post.id, '👀', auth.token);
    assertNoGraphQLErrors(added);
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, target.instance.id));
    const errorLog = mock.method(console, 'error', () => undefined);

    try {
      const hiddenAdd = await requestAddReaction(target.post.id, '🌈', auth.token);
      const deleted = await requestDeleteReaction(target.post.id, '👀', auth.token);

      assert.equal(hiddenAdd.errors?.[0]?.extensions?.code, 'NOT_FOUND');
      assertNoGraphQLErrors(deleted);
      assert.equal(deleted.data?.deleteReaction.reactionId, added.data?.addReaction.reaction.id);
      assert.equal(errorLog.mock.callCount(), 0);
      assert.equal(await db.$count(Reactions), 0);
    } finally {
      errorLog.mock.restore();
    }
  });

  test('허용되지 않은 Type은 VALIDATION과 field type으로 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);

    const result = await requestAddReaction(post.id, '👍', auth.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(result.errors?.[0]?.extensions?.field, 'type');
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('누락되거나 조회할 수 없는 Post는 같은 NOT_FOUND로 숨긴다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('private-author');
    const hiddenPost = await createPost(author.id, PostVisibility.DIRECT);
    const unavailableSource = await createPost(author.id);
    const unavailableRepost = await createPost(auth.profile.id, PostVisibility.PUBLIC, {
      repostSourceId: unavailableSource.id,
    });
    await db
      .update(Posts)
      .set({ visibility: PostVisibility.DIRECT })
      .where(eq(Posts.id, unavailableSource.id));

    for (const postId of [hiddenPost.id, unavailableRepost.id, crypto.randomUUID()]) {
      const result = await requestAddReaction(postId, '👀', auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('Post가 아닌 concrete global ID를 mutation input에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestGraphQL<{ addReaction: { reaction: ReactionNode } }>(
      `mutation AddReaction($input: AddReactionInput!) {
        addReaction(input: $input) { reaction { id } }
      }`,
      {
        input: {
          postId: globalId('Profile', auth.profile.id),
          type: '🥹',
        },
      },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('인증되었지만 active Profile이 없거나 비로그인인 요청은 거부한다', async () => {
    const auth = await createAuthenticatedSession({ activeProfile: false });
    const post = await createPost(auth.profile.id);

    for (const token of [auth.token, undefined]) {
      const result = await requestAddReaction(post.id, '🎉', token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }
  });

  test('비활성 Account이거나 active Profile membership이 없으면 요청을 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);

    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, auth.account.id));
    const disabledAccount = await requestAddReaction(post.id, '🎉', auth.token);
    assert.equal(disabledAccount.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    await db
      .update(Accounts)
      .set({ state: AccountState.ACTIVE })
      .where(eq(Accounts.id, auth.account.id));
    await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, auth.account.id));
    const missingMembership = await requestAddReaction(post.id, '🎉', auth.token);
    assert.equal(missingMembership.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('Reaction Node는 Post 조회 정책을 그대로 적용한다', async () => {
    const auth = await createAuthenticatedSession();
    const source = await createPost(auth.profile.id);
    const post = await createPost(auth.profile.id);
    const added = await requestAddReaction(post.id, '🌈', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);

    const publicNode = await requestNode(reactionId);
    assertNoGraphQLErrors(publicNode);
    assert.equal(publicNode.data?.node?.type, '🌈');

    await db.update(Posts).set({ repostSourceId: source.id }).where(eq(Posts.id, post.id));
    await db
      .update(Posts)
      .set({ visibility: PostVisibility.DIRECT })
      .where(eq(Posts.id, source.id));
    const hiddenNode = await requestNode(reactionId);
    assertNoGraphQLErrors(hiddenNode);
    assert.equal(hiddenNode.data?.node, null);
  });

  test('Post viewerReactions는 selected Profile별 현재 관계를 batch 조회하고 전환을 격리한다', async () => {
    const viewerA = await createAuthenticatedSession();
    const viewerB = await createAuthenticatedSession();
    const noSelectedProfile = await createAuthenticatedSession({ activeProfile: false });
    const author = await createProfile('viewer-reaction-author');
    const postA = await createPost(author.id);
    const postB = await createPost(author.id);

    const reactionA = await requestAddReaction(postA.id, '❤️', viewerA.token);
    const reactionB = await requestAddReaction(postB.id, '👀', viewerA.token);
    const reactionOtherProfile = await requestAddReaction(postA.id, '🎉', viewerB.token);
    assertNoGraphQLErrors(reactionA);
    assertNoGraphQLErrors(reactionB);
    assertNoGraphQLErrors(reactionOtherProfile);

    loaderBatches.clear();
    const batched = await requestViewerReactions([postA.id, postB.id], viewerA.token);
    assertNoGraphQLErrors(batched);
    assert.deepEqual(loaderBatches.get('reaction.viewerReactions'), [2]);
    assert.deepEqual(batched.data?.nodes, [
      {
        id: globalId('Post', postA.id),
        viewerReactions: [
          {
            id: reactionA.data?.addReaction.reaction.id,
            type: '❤️',
          },
        ],
      },
      {
        id: globalId('Post', postB.id),
        viewerReactions: [
          {
            id: reactionB.data?.addReaction.reaction.id,
            type: '👀',
          },
        ],
      },
    ]);

    const [otherProfile, noProfile, anonymous] = await Promise.all([
      requestViewerReactions([postA.id], viewerB.token),
      requestViewerReactions([postA.id], noSelectedProfile.token),
      requestViewerReactions([postA.id]),
    ]);
    assertNoGraphQLErrors(otherProfile);
    assertNoGraphQLErrors(noProfile);
    assertNoGraphQLErrors(anonymous);
    assert.deepEqual(otherProfile.data?.nodes[0]?.viewerReactions, [
      {
        id: reactionOtherProfile.data?.addReaction.reaction.id,
        type: '🎉',
      },
    ]);
    assert.deepEqual(noProfile.data?.nodes[0]?.viewerReactions, []);
    assert.deepEqual(anonymous.data?.nodes[0]?.viewerReactions, []);

    const switchedProfile = await createProfile('viewer-reaction-switched');
    await db.insert(AccountProfiles).values({
      accountId: viewerA.account.id,
      profileId: switchedProfile.id,
      role: AccountProfileRole.OWNER,
    });
    const [switchedReaction] = await db
      .insert(Reactions)
      .values({ postId: postA.id, profileId: switchedProfile.id, type: '🌈' })
      .returning();
    assert.ok(switchedReaction);
    await db
      .update(Sessions)
      .set({ activeProfileId: switchedProfile.id })
      .where(eq(Sessions.id, viewerA.session.id));

    const afterTransition = await requestViewerReactions([postA.id], viewerA.token);
    assertNoGraphQLErrors(afterTransition);
    assert.deepEqual(afterTransition.data?.nodes[0]?.viewerReactions, [
      { id: globalId('Reaction', switchedReaction.id), type: '🌈' },
    ]);
  });

  test('Owner는 Post를 조회할 수 없게 된 뒤에도 Post와 Type으로 Reaction을 삭제한다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('hidden-post-author');
    const post = await createPost(author.id);
    const added = await requestAddReaction(post.id, '❤️', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);
    await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, post.id));

    const deleted = await requestDeleteReaction(post.id, '❤️', auth.token);
    const repeated = await requestDeleteReaction(post.id, '❤️', auth.token);

    assertNoGraphQLErrors(deleted);
    assertNoGraphQLErrors(repeated);
    assert.equal(deleted.data?.deleteReaction.reactionId, reactionId);
    assert.equal(deleted.data?.deleteReaction.post, null);
    assert.equal(repeated.data?.deleteReaction.reactionId, null);
    assert.equal(repeated.data?.deleteReaction.post, null);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      0,
    );
  });

  test('Post와 Type 삭제는 다른 Profile의 Reaction과 Notification을 유지한다', async () => {
    const owner = await createAuthenticatedSession();
    const attacker = await createAuthenticatedSession();
    const recipient = await createProfile(`recipient-${crypto.randomUUID()}`);
    const post = await createPost(recipient.id);
    const added = await requestAddReaction(post.id, '🎉', owner.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);
    const reaction = await db
      .select()
      .from(Reactions)
      .where(eq(Reactions.postId, post.id))
      .then(firstOrThrow);
    assert.deepEqual(
      await db
        .select({
          kind: Notifications.kind,
          recipientProfileId: Notifications.recipientProfileId,
          sourceId: Notifications.sourceId,
        })
        .from(Notifications)
        .where(eq(Notifications.sourceId, reaction.id)),
      [
        {
          kind: NotificationKind.REACTION,
          recipientProfileId: recipient.id,
          sourceId: reaction.id,
        },
      ],
    );

    const result = await requestDeleteReaction(post.id, '🎉', attacker.token);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.deleteReaction.reactionId, null);
    assert.deepEqual(result.data?.deleteReaction.post?.viewerReactions, []);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      1,
    );
    assert.deepEqual(
      await db
        .select({
          kind: Notifications.kind,
          recipientProfileId: Notifications.recipientProfileId,
          sourceId: Notifications.sourceId,
        })
        .from(Notifications)
        .where(eq(Notifications.sourceId, reaction.id)),
      [
        {
          kind: NotificationKind.REACTION,
          recipientProfileId: recipient.id,
          sourceId: reaction.id,
        },
      ],
    );
  });

  test('비활성 Account이거나 active Profile membership이 없으면 삭제를 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);
    const added = await requestAddReaction(post.id, '☘️', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);

    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, auth.account.id));
    const disabledAccount = await requestDeleteReaction(post.id, '☘️', auth.token);
    assert.equal(disabledAccount.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    await db
      .update(Accounts)
      .set({ state: AccountState.ACTIVE })
      .where(eq(Accounts.id, auth.account.id));
    await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, auth.account.id));
    const missingMembership = await requestDeleteReaction(post.id, '☘️', auth.token);
    assert.equal(missingMembership.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      1,
    );
  });

  test('없는 조합은 no-op이고 오래된 Post/Type 재시도는 재생성된 Reaction을 제거한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);
    const missing = await requestDeleteReaction(post.id, '👀', auth.token);
    assertNoGraphQLErrors(missing);
    assert.equal(missing.data?.deleteReaction.reactionId, null);
    assert.deepEqual(missing.data?.deleteReaction.post?.viewerReactions, []);

    const first = await requestAddReaction(post.id, '👀', auth.token);
    const firstId = first.data?.addReaction.reaction.id;
    assert.ok(firstId);
    assertNoGraphQLErrors(await requestDeleteReaction(post.id, '👀', auth.token));
    const recreated = await requestAddReaction(post.id, '👀', auth.token);
    const recreatedId = recreated.data?.addReaction.reaction.id;
    assert.ok(recreatedId);
    assert.notEqual(recreatedId, firstId);

    const stale = await requestDeleteReaction(post.id, '👀', auth.token);
    assertNoGraphQLErrors(stale);
    assert.equal(stale.data?.deleteReaction.reactionId, recreatedId);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      0,
    );
  });

  test('Reaction 삭제는 실제 삭제된 ID의 Notification만 정리한다', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createAuthenticatedSession();
    const post = await createPost(recipient.profile.id);
    const added = await requestAddReaction(post.id, '🎉', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);
    const reaction = await db
      .select()
      .from(Reactions)
      .where(eq(Reactions.postId, post.id))
      .then(firstOrThrow);

    const deleted = await requestDeleteReaction(post.id, '🎉', auth.token);
    assertNoGraphQLErrors(deleted);
    assert.equal(await db.$count(Notifications), 0);

    await db.insert(Notifications).values({
      kind: NotificationKind.REACTION,
      recipientProfileId: recipient.profile.id,
      sourceId: reaction.id,
    });
    assert.equal(await db.$count(Notifications), 1);

    const repeated = await requestDeleteReaction(post.id, '🎉', auth.token);

    assertNoGraphQLErrors(repeated);
    assert.equal(repeated.data?.deleteReaction.reactionId, null);
    assert.equal(await db.$count(Reactions), 0);
    assert.equal(await db.$count(Notifications), 1);
  });

  test('Notification cleanup 실패에도 Reaction 삭제 성공과 stale visibility를 유지하고 오류를 기록한다', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createAuthenticatedSession();
    const post = await createPost(recipient.profile.id);
    const added = await requestAddReaction(post.id, '👀', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);
    const reaction = await db
      .select()
      .from(Reactions)
      .where(eq(Reactions.postId, post.id))
      .then(firstOrThrow);
    const notification = await db
      .select()
      .from(Notifications)
      .where(eq(Notifications.sourceId, reaction.id))
      .then(firstOrThrow);

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

    let deleted: Awaited<ReturnType<typeof requestDeleteReaction>>;
    try {
      deleted = await requestDeleteReaction(post.id, '👀', auth.token);
    } finally {
      console.error = originalConsoleError;
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_reaction_notification_delete ON notification;
        DROP FUNCTION IF EXISTS fail_reaction_notification_delete();
      `);
    }

    assertNoGraphQLErrors(deleted);
    assert.equal(await db.$count(Reactions), 0);
    assert.equal(await db.$count(Notifications), 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.[0], 'Failed to clean up Reaction Notification');
    assert.equal((errors[0]?.[1] as { reactionId?: string } | undefined)?.reactionId, reaction.id);
    assert.ok((errors[0]?.[1] as { error?: unknown } | undefined)?.error);

    const surfaces = await requestNotificationSurfaces(recipient.profile.id, recipient.token);
    assertNoGraphQLErrors(surfaces);
    assert.deepEqual(surfaces.data?.node?.notifications.edges, []);
    assert.equal(surfaces.data?.node?.unreadNotificationCount, 0);

    const staleNode = await requestNode(
      globalId('ReactionNotification', notification.id),
      recipient.token,
    );
    assertNoGraphQLErrors(staleNode);
    assert.equal(staleNode.data?.node, null);

    const read = await requestMarkNotificationRead(
      globalId('ReactionNotification', notification.id),
      recipient.token,
    );
    assert.equal(read.errors?.[0]?.extensions?.code, 'NOT_FOUND');
  });

  test('stale Notification cleanup과 Undo delivery 실패를 독립 격리한다', async () => {
    const auth = await createAuthenticatedSession();
    const target = await createRemoteReactionTarget({
      inboxUri: 'not a valid inbox URI',
      state: InstanceState.UNRESPONSIVE,
    });
    const added = await requestAddReaction(target.post.id, '☘️', auth.token);
    assertNoGraphQLErrors(added);
    const reaction = await db.select().from(Reactions).then(firstOrThrow);
    await db.insert(Notifications).values({
      kind: NotificationKind.REACTION,
      recipientProfileId: target.profile.id,
      sourceId: reaction.id,
    });
    assert.equal(await db.$count(Notifications), 1);
    await db
      .update(Instances)
      .set({ state: InstanceState.ACTIVE })
      .where(eq(Instances.id, target.instance.id));

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
    const errorLog = mock.method(console, 'error', () => undefined);

    let deleted: Awaited<ReturnType<typeof requestDeleteReaction>>;
    try {
      deleted = await requestDeleteReaction(target.post.id, '☘️', auth.token);
    } finally {
      errorLog.mock.restore();
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_reaction_notification_delete ON notification;
        DROP FUNCTION IF EXISTS fail_reaction_notification_delete();
      `);
    }

    assertNoGraphQLErrors(deleted);
    assert.equal(deleted.data?.deleteReaction.reactionId, added.data?.addReaction.reaction.id);
    assert.equal(await db.$count(Reactions), 0);
    assert.equal(await db.$count(Notifications), 1);
    assert.deepEqual(
      errorLog.mock.calls.map(({ arguments: [message] }) => message),
      [
        'Failed to clean up Reaction Notification',
        'Post-commit ActivityPub Reaction Undo delivery failed',
      ],
    );
  });

  test('Post가 아닌 concrete global ID와 잘못된 Type을 delete input에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const wrongId = await requestDeleteReactionWithInput(
      { postId: globalId('Profile', auth.profile.id), type: '👀' },
      auth.token,
    );
    const wrongType = await requestDeleteReactionWithInput(
      { postId: globalId('Post', crypto.randomUUID()), type: 'invalid' },
      auth.token,
    );

    assert.ok(wrongId.errors?.[0]);
    assert.equal(wrongType.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(wrongType.errors?.[0]?.extensions?.field, 'type');
  });

  test('Reaction Profile은 Type별로 최신 Reaction순 Profile connection을 반환한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);
    const oldest = await createProfile('oldest');
    const newest = await createProfile('newest');
    const otherType = await createProfile('other-type');
    await insertReaction({
      id: '00000000-0000-8000-8000-000000000011',
      postId: post.id,
      profileId: oldest.id,
      type: '❤️',
      createdAt: '2026-07-21T00:00:00Z',
    });
    await insertReaction({
      id: '00000000-0000-8000-8000-000000000012',
      postId: post.id,
      profileId: newest.id,
      type: '❤️',
      createdAt: '2026-07-21T00:00:01Z',
    });
    await insertReaction({
      id: '00000000-0000-8000-8000-000000000013',
      postId: post.id,
      profileId: otherType.id,
      type: '🎉',
      createdAt: '2026-07-21T00:00:02Z',
    });

    const result = await requestReactionProfiles(post.id, '❤️');

    assertNoGraphQLErrors(result);
    assert.deepEqual(
      result.data?.node?.reactionProfiles.edges.map(({ node }) => node.handle),
      ['newest', 'oldest'],
    );
  });

  test('Reaction Profile은 숨겨진 최신 row보다 먼저 visible page를 채우고 양방향 경계를 유지한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);
    const suspendedInstance = await createRemoteInstance({ state: InstanceState.SUSPENDED });
    const suspendedInstanceProfile = await createProfile('suspended-instance-profile', {
      instanceId: suspendedInstance.id,
    });
    const disabledProfile = await createProfile('disabled-profile', {
      state: ProfileState.DISABLED,
    });
    const visibleHigh = await createProfile('visible-high-id');
    const visibleLow = await createProfile('visible-low-id');
    const visibleOldest = await createProfile('visible-oldest');
    const visibleHighReactionId = '00000000-0000-8000-8000-000000000024';
    const visibleLowReactionId = '00000000-0000-8000-8000-000000000023';

    await Promise.all([
      insertReaction({
        id: '00000000-0000-8000-8000-000000000026',
        postId: post.id,
        profileId: suspendedInstanceProfile.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:05Z',
      }),
      insertReaction({
        id: '00000000-0000-8000-8000-000000000025',
        postId: post.id,
        profileId: disabledProfile.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:04Z',
      }),
      insertReaction({
        id: visibleHighReactionId,
        postId: post.id,
        profileId: visibleHigh.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:03Z',
      }),
      insertReaction({
        id: visibleLowReactionId,
        postId: post.id,
        profileId: visibleLow.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:03Z',
      }),
      insertReaction({
        id: '00000000-0000-8000-8000-000000000022',
        postId: post.id,
        profileId: visibleOldest.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:01Z',
      }),
    ]);

    const firstPage = await requestReactionProfiles(post.id, '❤️', { first: 2 });
    assertNoGraphQLErrors(firstPage);
    const firstConnection = firstPage.data?.node?.reactionProfiles;
    assert.ok(firstConnection);
    const firstHandles = firstConnection.edges.map(({ node }) => node.handle);
    assert.deepEqual(firstHandles, ['visible-high-id', 'visible-low-id']);
    assert.equal(firstConnection.pageInfo.hasNextPage, true);
    assert.equal(firstConnection.pageInfo.hasPreviousPage, false);
    assert.notEqual(firstConnection.pageInfo.endCursor, visibleLowReactionId);
    assert.doesNotMatch(firstConnection.pageInfo.endCursor ?? '', /2026-07-21/);

    const secondPage = await requestReactionProfiles(post.id, '❤️', {
      after: firstConnection.pageInfo.endCursor,
      first: 2,
    });
    assertNoGraphQLErrors(secondPage);
    const secondConnection = secondPage.data?.node?.reactionProfiles;
    assert.ok(secondConnection);
    const secondHandles = secondConnection.edges.map(({ node }) => node.handle);
    assert.deepEqual(secondHandles, ['visible-oldest']);
    assert.equal(secondConnection.pageInfo.hasNextPage, false);
    assert.equal(secondConnection.pageInfo.hasPreviousPage, true);
    assert.equal(new Set([...firstHandles, ...secondHandles]).size, 3);

    const backwardPage = await requestReactionProfiles(post.id, '❤️', {
      before: secondConnection.pageInfo.startCursor,
      last: 2,
    });
    assertNoGraphQLErrors(backwardPage);
    const backwardConnection = backwardPage.data?.node?.reactionProfiles;
    assert.ok(backwardConnection);
    assert.deepEqual(
      backwardConnection.edges.map(({ node }) => node.handle),
      firstHandles,
    );
    assert.equal(backwardConnection.pageInfo.hasPreviousPage, false);
    assert.equal(backwardConnection.pageInfo.hasNextPage, true);
  });

  test('Reaction Profile은 Post visibility와 Type validation 경계를 우회하지 않는다', async () => {
    const viewer = await createAuthenticatedSession();
    const author = await createProfile('direct-author');
    const directPost = await createPost(author.id, PostVisibility.DIRECT);

    const result = await requestReactionProfiles(directPost.id, '❤️', { first: 1 });
    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node, null);

    const publicPost = await createPost(viewer.profile.id);
    const invalidType = await requestReactionProfiles(publicPost.id, '👍', { first: 1 });
    assert.equal(invalidType.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(invalidType.errors?.[0]?.extensions?.field, 'type');
  });

  test('Reaction count는 viewer와 Profile visibility에 무관하게 집계하고 삭제를 반영한다', async () => {
    const viewer = await createAuthenticatedSession();
    const post = await createPost(viewer.profile.id);
    const suspendedInstance = await createRemoteInstance({ state: InstanceState.SUSPENDED });
    const unavailableProfile = await createProfile('unavailable-count-profile', {
      instanceId: suspendedInstance.id,
    });
    const otherProfile = await createProfile('other-count-profile');

    await Promise.all([
      insertReaction({
        id: '00000000-0000-8000-8000-000000000031',
        postId: post.id,
        profileId: viewer.profile.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:01Z',
      }),
      insertReaction({
        id: '00000000-0000-8000-8000-000000000032',
        postId: post.id,
        profileId: unavailableProfile.id,
        type: '❤️',
        createdAt: '2026-07-21T00:00:02Z',
      }),
      insertReaction({
        id: '00000000-0000-8000-8000-000000000033',
        postId: post.id,
        profileId: otherProfile.id,
        type: '🎉',
        createdAt: '2026-07-21T00:00:03Z',
      }),
    ]);

    const authenticated = await requestReactionCounts(post.id, viewer.token);
    const anonymous = await requestReactionCounts(post.id);
    assertNoGraphQLErrors(authenticated);
    assertNoGraphQLErrors(anonymous);
    assert.deepEqual(authenticated.data?.node?.reactionCounts, [
      { type: '❤️', count: 2 },
      { type: '🎉', count: 1 },
    ]);
    assert.deepEqual(
      anonymous.data?.node?.reactionCounts,
      authenticated.data?.node?.reactionCounts,
    );

    await db.delete(Reactions).where(eq(Reactions.id, '00000000-0000-8000-8000-000000000033'));
    const afterDelete = await requestReactionCounts(post.id, viewer.token);
    assertNoGraphQLErrors(afterDelete);
    assert.deepEqual(afterDelete.data?.node?.reactionCounts, [{ type: '❤️', count: 2 }]);

    const emptyPost = await createPost(viewer.profile.id);
    const empty = await requestReactionCounts(emptyPost.id, viewer.token);
    assertNoGraphQLErrors(empty);
    assert.deepEqual(empty.data?.node?.reactionCounts, []);

    const privateAuthor = await createProfile('private-count-author');
    const privatePost = await createPost(privateAuthor.id, PostVisibility.DIRECT);
    const hiddenPost = await requestReactionCounts(privatePost.id, viewer.token);
    assertNoGraphQLErrors(hiddenPost);
    assert.equal(hiddenPost.data?.node, null);
  });

  test('Reaction count는 숨겨진 Repost source의 raw Post 경로에서 노출되지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const sourceAuthor = await createProfile('hidden-repost-source-author');
    const { post: source } = await createCorePost({
      document: postContentDocumentFromText(crypto.randomUUID()),
      origin: 'LOCAL',
      profileId: sourceAuthor.id,
      visibility: PostVisibility.PUBLIC,
    });
    const { repost } = await repostPost({
      actorProfileId: auth.profile.id,
      sourcePostId: source.id,
    });
    const reactionProfile = await createProfile('raw-post-reaction-profile');
    const reaction = await db
      .insert(Reactions)
      .values({ postId: repost.id, profileId: reactionProfile.id, type: '🎉' })
      .returning()
      .then(firstOrThrow);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.REACTION,
        recipientProfileId: auth.profile.id,
        sourceId: reaction.id,
      })
      .returning()
      .then(firstOrThrow);

    await db
      .update(Posts)
      .set({ visibility: PostVisibility.DIRECT })
      .where(eq(Posts.id, source.id));

    const result = await requestGraphQL<{
      node: { post: { id: string; reactionCounts: Array<{ type: string; count: number }> } } | null;
    }>(
      `query ReactionNotificationRawPost($id: ID!) {
        node(id: $id) {
          ... on ReactionNotification {
            post { id reactionCounts { type count } }
          }
        }
      }`,
      { id: globalId('ReactionNotification', notification.id) },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node?.post, {
      id: globalId('Post', repost.id),
      reactionCounts: [],
    });
  });
});

type ReactionNode = {
  __typename: 'Reaction';
  createdAt: string;
  id: string;
  type: string;
};

type NotificationSurfacesNode = {
  notifications: {
    edges: Array<{ node: { __typename: string; id: string } }>;
  };
  unreadNotificationCount: number;
};

type ReactionProfilesNode = {
  reactionProfiles: {
    edges: Array<{ cursor: string; node: { __typename: 'Profile'; handle: string; id: string } }>;
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
    };
  };
};

type ReactionCountsNode = {
  reactionCounts: Array<{ type: string; count: number }>;
};

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{
    extensions?: { code?: string; field?: string };
    message: string;
  }>;
};

const requestAddReaction = (postId: string, type: string, token?: string) =>
  requestGraphQL<{ addReaction: { reaction: ReactionNode } }>(
    `mutation AddReaction($input: AddReactionInput!) {
      addReaction(input: $input) {
        reaction { __typename id type createdAt }
      }
    }`,
    { input: { postId: globalId('Post', postId), type } },
    token,
  );

const requestDeleteReaction = (postId: string, type: string, token?: string) =>
  requestDeleteReactionWithInput({ postId: globalId('Post', postId), type }, token);

const requestDeleteReactionWithInput = (input: { postId: string; type: string }, token?: string) =>
  requestGraphQL<{
    deleteReaction: {
      post: { id: string; viewerReactions: Array<{ id: string; type: string }> } | null;
      reactionId: string | null;
    };
  }>(
    `mutation DeleteReaction($input: DeleteReactionInput!) {
      deleteReaction(input: $input) {
        reactionId
        post {
          id
          viewerReactions { id type }
        }
      }
    }`,
    { input },
    token,
  );

const requestViewerReactions = (postIds: string[], token?: string) =>
  requestGraphQL<{
    nodes: Array<{
      id: string;
      viewerReactions: Array<{ id: string; type: string }>;
    } | null>;
  }>(
    `query ViewerReactions($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Post {
          id
          viewerReactions { id type }
        }
      }
    }`,
    { ids: postIds.map((postId) => globalId('Post', postId)) },
    token,
  );

const requestNode = (id: string, token?: string) =>
  requestGraphQL<{ node: { __typename: string; id: string; type?: string } | null }>(
    `query ReactionNode($id: ID!) {
      node(id: $id) { __typename id ... on Reaction { type } }
    }`,
    { id },
    token,
  );

const requestNotificationSurfaces = (profileId: string, token: string) =>
  requestGraphQL<{ node: NotificationSurfacesNode | null }>(
    `query NotificationSurfaces($profileId: ID!) {
      node(id: $profileId) {
        ... on Profile {
          notifications(first: 10) { edges { node { __typename id } } }
          unreadNotificationCount
        }
      }
    }`,
    { profileId: globalId('Profile', profileId) },
    token,
  );

const requestMarkNotificationRead = (notificationId: string, token: string) =>
  requestGraphQL<{
    markNotificationRead: {
      notification: { __typename: string; id: string };
      recipientProfile: { id: string };
    };
  }>(
    `mutation MarkNotificationRead($input: MarkNotificationReadInput!) {
      markNotificationRead(input: $input) {
        notification { __typename id }
        recipientProfile { id }
      }
    }`,
    { input: { id: notificationId } },
    token,
  );

const requestReactionProfiles = (
  postId: string,
  type: string,
  pagination: { after?: string | null; before?: string | null; first?: number; last?: number } = {},
) =>
  requestGraphQL<{ node: ReactionProfilesNode | null }>(
    `query ReactionProfiles(
      $postId: ID!
      $type: String!
      $first: Int
      $after: String
      $last: Int
      $before: String
    ) {
      node(id: $postId) {
        ... on Post {
          reactionProfiles(type: $type, first: $first, after: $after, last: $last, before: $before) {
            edges { cursor node { __typename id handle } }
            pageInfo { startCursor endCursor hasPreviousPage hasNextPage }
          }
        }
      }
    }`,
    { postId: globalId('Post', postId), type, ...pagination },
  );

const requestReactionCounts = (postId: string, token?: string) =>
  requestGraphQL<{ node: ReactionCountsNode | null }>(
    `query ReactionCounts($postId: ID!) {
      node(id: $postId) {
        ... on Post {
          reactionCounts { type count }
        }
      }
    }`,
    { postId: globalId('Post', postId) },
    token,
  );

const requestGraphQL = async <TData>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<GraphQLResult<TData>> => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers,
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const createProfile = (
  handle: string,
  {
    instanceId = localInstanceId,
    state = ProfileState.ACTIVE,
  }: { instanceId?: string; state?: ProfileState } = {},
) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createPost = (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
  { repostSourceId }: { repostSourceId?: string } = {},
) =>
  db
    .insert(Posts)
    .values({ profileId, repostSourceId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);

const createRemoteInstance = ({ state }: { state: InstanceState }) => {
  const domain = `remote-${crypto.randomUUID()}.example`;
  return db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state,
    })
    .returning()
    .then(firstOrThrow);
};

const createRemoteReactionTarget = async ({
  inboxUri,
  state = InstanceState.ACTIVE,
}: {
  inboxUri: string;
  state?: InstanceState;
}) => {
  const instance = await createRemoteInstance({ state });
  const profile = await createProfile(`remote-target-${crypto.randomUUID()}`, {
    instanceId: instance.id,
  });
  await db.insert(ActivityPubActors).values({
    inboxUri,
    profileId: profile.id,
    sharedInboxUri: `https://${instance.domain}/inbox`,
    type: 'PERSON',
    uri: `https://${instance.domain}/users/${profile.id}`,
  });
  const post = await createPost(profile.id);
  await db.insert(ActivityPubPosts).values({
    postId: post.id,
    receivedAt: Temporal.Now.instant(),
    uri: `https://${instance.domain}/posts/${post.id}`,
  });

  return { instance, post, profile };
};

const insertReaction = ({
  createdAt,
  ...values
}: {
  createdAt: string;
  id: string;
  postId: string;
  profileId: string;
  type: string;
}) => db.insert(Reactions).values({ ...values, createdAt: Temporal.Instant.from(createdAt) });

const createAuthenticatedSession = async ({
  activeProfile = true,
  instanceId = localInstanceId,
}: { activeProfile?: boolean; instanceId?: string } = {}) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${suffix}`, { instanceId });
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `token-${suffix}`;
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: activeProfile ? profile.id : null,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);
  return { account, profile, session, token };
};

const resetFixtures = async () => {
  await db.delete(Notifications);
  await db.delete(Reactions);
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(ne(Instances.id, localInstanceId));
};

const truncateDatabase = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(databaseUrl.hostname));
  assert.match(decodeURIComponent(databaseUrl.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
  await pg.unsafe(`
    DO $$
    DECLARE truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement FROM pg_tables WHERE schemaname = 'public';
      IF truncate_statement IS NOT NULL THEN EXECUTE truncate_statement; END IF;
    END $$;
  `);
};
