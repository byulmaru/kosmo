import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
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
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { createPost as createCorePost, repostPost } from '@kosmo/core/services';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId as globalId } from '../../../src/graphql/global-id';
import type * as CoreDb from '@kosmo/core/db';
import type { Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
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
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Reaction', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
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

    const { deriveContext } = await import('../../../src/context');
    const { yoga } = await import('../../../src/graphql');
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
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

  test('Owner는 Post를 조회할 수 없게 된 뒤에도 Reaction을 삭제하고 같은 ID로 재시도한다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('hidden-post-author');
    const post = await createPost(author.id);
    const added = await requestAddReaction(post.id, '❤️', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);
    await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, post.id));

    const deleted = await requestDeleteReaction(reactionId, auth.token);
    const repeated = await requestDeleteReaction(reactionId, auth.token);

    assertNoGraphQLErrors(deleted);
    assertNoGraphQLErrors(repeated);
    assert.equal(deleted.data?.deleteReaction.reactionId, reactionId);
    assert.equal(repeated.data?.deleteReaction.reactionId, reactionId);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      0,
    );
  });

  test('현재 타인 소유 Reaction 삭제는 PERMISSION_DENIED로 거부한다', async () => {
    const owner = await createAuthenticatedSession();
    const attacker = await createAuthenticatedSession();
    const post = await createPost(owner.profile.id);
    const added = await requestAddReaction(post.id, '🎉', owner.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);

    const result = await requestDeleteReaction(reactionId, attacker.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      1,
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
    const disabledAccount = await requestDeleteReaction(reactionId, auth.token);
    assert.equal(disabledAccount.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    await db
      .update(Accounts)
      .set({ state: AccountState.ACTIVE })
      .where(eq(Accounts.id, auth.account.id));
    await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, auth.account.id));
    const missingMembership = await requestDeleteReaction(reactionId, auth.token);
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

  test('이미 없는 ID와 stale ID는 성공하고 다시 생성된 Reaction은 유지한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);
    const missingId = globalId('Reaction', crypto.randomUUID());
    const missing = await requestDeleteReaction(missingId, auth.token);
    assertNoGraphQLErrors(missing);
    assert.equal(missing.data?.deleteReaction.reactionId, missingId);

    const first = await requestAddReaction(post.id, '👀', auth.token);
    const firstId = first.data?.addReaction.reaction.id;
    assert.ok(firstId);
    assertNoGraphQLErrors(await requestDeleteReaction(firstId, auth.token));
    const recreated = await requestAddReaction(post.id, '👀', auth.token);
    const recreatedId = recreated.data?.addReaction.reaction.id;
    assert.ok(recreatedId);
    assert.notEqual(recreatedId, firstId);

    const stale = await requestDeleteReaction(firstId, auth.token);
    assertNoGraphQLErrors(stale);
    assert.equal(stale.data?.deleteReaction.reactionId, firstId);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      1,
    );
  });

  test('Reaction이 아닌 concrete global ID를 delete input에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestDeleteReaction(globalId('Profile', auth.profile.id), auth.token);

    assert.ok(result.errors?.[0]);
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
    const repost = await repostPost({
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

const requestDeleteReaction = (reactionId: string, token?: string) =>
  requestGraphQL<{ deleteReaction: { reactionId: string } }>(
    `mutation DeleteReaction($input: DeleteReactionInput!) {
      deleteReaction(input: $input) { reactionId }
    }`,
    { input: { id: reactionId } },
    token,
  );

const requestNode = (id: string) =>
  requestGraphQL<{ node: { type: string } | null }>(
    `query ReactionNode($id: ID!) {
      node(id: $id) { ... on Reaction { type } }
    }`,
    { id },
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
}: { activeProfile?: boolean } = {}) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${suffix}`);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `token-${suffix}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: activeProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });
  return { account, profile, token };
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
