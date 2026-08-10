import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import {
  cancelProfileFollowRequest,
  createReplyNotification,
  followProfile,
} from '@kosmo/core/services';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { encodeGlobalId as EncodeGlobalId } from '@kosmo/core/global-id';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

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
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let encodeGlobalId: typeof EncodeGlobalId;
let app: Hono<Env>;
let localInstanceId: string;

describe('Notification GraphQL Node boundary', () => {
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
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
      Reactions,
      Sessions,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    ({ yoga } = await import('../../../src/graphql'));
    ({ encodeGlobalId } = await import('@kosmo/core/global-id'));

    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      const context = await deriveContext(c);
      c.set('context', context);
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

  test('resolves FOLLOW rows through Node and preserves nodes input order', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('recipient');
    const relatedProfiles = await Promise.all([createProfile('first'), createProfile('second')]);
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    const notifications = await Promise.all(
      relatedProfiles.map((related, index) =>
        createFollowNotification(
          recipient.id,
          related.id,
          index === 0 ? '00000000-0000-8006-8000-000000000275' : undefined,
        ),
      ),
    );
    const notificationIds = notifications.map(({ id }) => encodeGlobalId('FollowNotification', id));
    const profileId = encodeGlobalId('Profile', auth.profile.id);
    const relatedProfileIds = relatedProfiles.map(({ id }) => encodeGlobalId('Profile', id));
    const mixedIds = [notificationIds[1]!, profileId, notificationIds[0]!];

    const result = await requestGraphQL<{
      node: NotificationNode | null;
      nodes: Array<NotificationNode | ProfileNode | null>;
    }>(
      `query NotificationNodes($id: ID!, $ids: [ID!]!) {
        node(id: $id) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on FollowNotification { profile { id } }
        }
        nodes(ids: $ids) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on FollowNotification { profile { id } }
          ... on Profile { id }
        }
      }`,
      { id: notificationIds[0]!, ids: mixedIds },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.__typename, 'FollowNotification');
    assert.equal(result.data?.node?.id, notificationIds[0]);
    assert.equal(result.data?.node?.profile.id, relatedProfileIds[0]);
    assert.deepEqual(
      result.data?.nodes.map((node) => [node?.__typename, node?.id]),
      [
        ['FollowNotification', notificationIds[1]],
        ['Profile', profileId],
        ['FollowNotification', notificationIds[0]],
      ],
    );
    assert.equal((result.data?.nodes[0] as NotificationNode).profile.id, relatedProfileIds[1]);
    assert.equal((result.data?.nodes[2] as NotificationNode).profile.id, relatedProfileIds[0]);
  });

  test('resolves FOLLOW_REQUEST rows through Node, list, unread count and Read', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-recipient');
    const requester = await createProfile('follow-request-requester');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    const request = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: requester.id })
      .returning()
      .then(firstOrThrow);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: request.id,
      })
      .returning()
      .then(firstOrThrow);
    const notificationId = encodeGlobalId('FollowRequestNotification', notification.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const requesterId = encodeGlobalId('Profile', requester.id);
    const requestId = encodeGlobalId('ProfileFollowRequest', request.id);

    const result = await requestGraphQL<{
      node: {
        __typename: string;
        followRequest: { id: string };
        profile: { id: string };
      } | null;
      profile: {
        unreadNotificationCount: number;
        notifications: {
          edges: Array<{
            node: {
              __typename: string;
              followRequest: { id: string };
              profile: { id: string };
            };
          }>;
        };
      } | null;
    }>(
      `query FollowRequestNotification($notificationId: ID!, $profileId: ID!) {
        node(id: $notificationId) {
          __typename
          ... on FollowRequestNotification { profile { id } followRequest { id } }
        }
        profile: node(id: $profileId) {
          ... on Profile {
            unreadNotificationCount
            notifications(first: 10) {
              edges {
                node {
                  __typename
                  ... on FollowRequestNotification { profile { id } followRequest { id } }
                }
              }
            }
          }
        }
      }`,
      { notificationId, profileId: recipientId },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'FollowRequestNotification',
      followRequest: { id: requestId },
      profile: { id: requesterId },
    });
    assert.equal(result.data?.profile?.unreadNotificationCount, 1);
    assert.deepEqual(result.data?.profile?.notifications.edges[0]?.node, {
      __typename: 'FollowRequestNotification',
      followRequest: { id: requestId },
      profile: { id: requesterId },
    });

    const marked = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(marked);
    assert.equal(
      marked.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount,
      0,
    );
  });

  test('uses the visible Follow Request source snapshot for Node and connection fields', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-snapshot-recipient');
    const requester = await createProfile('follow-request-snapshot-requester');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    const request = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: requester.id })
      .returning()
      .then(firstOrThrow);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: request.id,
      })
      .returning()
      .then(firstOrThrow);
    const notificationId = encodeGlobalId('FollowRequestNotification', notification.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const requestId = encodeGlobalId('ProfileFollowRequest', request.id);
    const requesterId = encodeGlobalId('Profile', requester.id);

    try {
      const result = await requestGraphQL<{
        node: {
          __typename: string;
          profile: { id: string };
          followRequest: { id: string };
        } | null;
        profile: {
          notifications: {
            edges: Array<{
              node: {
                __typename: string;
                profile: { id: string };
                followRequest: { id: string };
              };
            }>;
          };
        } | null;
      }>(
        `query FollowRequestSourceSnapshot($notificationId: ID!, $profileId: ID!) {
          node(id: $notificationId) {
            __typename
            ... on FollowRequestNotification { profile { id } followRequest { id } }
          }
          profile: node(id: $profileId) {
            ... on Profile {
              notifications(first: 10) {
                edges {
                  node {
                    __typename
                    ... on FollowRequestNotification { profile { id } followRequest { id } }
                  }
                }
              }
            }
          }
        }`,
        { notificationId, profileId: recipientId },
        auth.token,
      );

      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.node, {
        __typename: 'FollowRequestNotification',
        followRequest: { id: requestId },
        profile: { id: requesterId },
      });
      assert.deepEqual(result.data?.profile?.notifications.edges[0]?.node, {
        __typename: 'FollowRequestNotification',
        followRequest: { id: requestId },
        profile: { id: requesterId },
      });
    } finally {
      await db.delete(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, request.id));
    }
  });

  test('does not leave a stale row when terminal request deletion overlaps post-commit creation', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-race-recipient');
    const requester = await createProfile('follow-request-race-requester');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(eq(Profiles.id, recipient.id));

    // The trigger is test-only: it pauses the INSERT after the source SELECT has
    // observed and locked the pending row. The terminal delete must reach that row
    // lock before the INSERT is released, proving the final state has no orphan.
    const advisoryKey = 321_321;
    const control = await pg.reserve();
    let unlocked = false;
    let functionInstalled = false;
    let triggerInstalled = false;
    let followPromise: ReturnType<typeof followProfile> | undefined;
    let cancelPromise: ReturnType<typeof cancelProfileFollowRequest> | undefined;
    try {
      await control`SELECT pg_advisory_lock(${advisoryKey})`;
      await db.execute(
        sql.raw(`
        CREATE FUNCTION block_follow_request_notification_insert() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_lock(${advisoryKey});
          PERFORM pg_advisory_unlock(${advisoryKey});
          RETURN NEW;
        END;
        $$
      `),
      );
      functionInstalled = true;
      await db.execute(
        sql.raw(`
        CREATE TRIGGER follow_request_notification_race
        BEFORE INSERT ON "notification"
        FOR EACH ROW WHEN (NEW.kind = 'FOLLOW_REQUEST'::notification_kind)
        EXECUTE FUNCTION block_follow_request_notification_insert()
      `),
      );
      triggerInstalled = true;

      followPromise = followProfile({
        followerProfileId: requester.id,
        followeeProfileId: recipient.id,
      });
      let insertBlocked = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const activity = await db.execute(sql`
          SELECT 1
          FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query ILIKE '%insert into "notification"%'
          LIMIT 1
        `);
        if (activity.length > 0) {
          insertBlocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(insertBlocked, true);

      const request = await db
        .select()
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, requester.id),
            eq(ProfileFollowRequests.followeeProfileId, recipient.id),
          ),
        )
        .then(firstOrThrow);
      cancelPromise = cancelProfileFollowRequest({
        actorProfileId: requester.id,
        profileFollowRequestId: request.id,
      });
      let deleteBlocked = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const activity = await db.execute(sql`
          SELECT 1
          FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND wait_event IN ('transactionid', 'tuple')
            AND query ILIKE '%delete from "profile_follow_request"%'
          LIMIT 1
        `);
        if (activity.length > 0) {
          deleteBlocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(deleteBlocked, true);
      await control`SELECT pg_advisory_unlock(${advisoryKey})`;
      unlocked = true;
      const cancelResult = await cancelPromise;
      assert.equal(cancelResult.profileFollowRequestId, request.id);
      const result = await followPromise;
      assert.equal(result.result.kind, 'PENDING');

      const stale = await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.sourceId, request.id));
      assert.equal(stale.length, 0);
      const notificationId = encodeGlobalId('FollowRequestNotification', request.id);
      const recipientId = encodeGlobalId('Profile', recipient.id);
      assert.deepEqual(await loadNodes([notificationId], auth.token), [null]);
      const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
      assertNoGraphQLErrors(connection);
      assert.deepEqual(connection.data?.node?.notifications.edges, []);
      const count = await loadUnreadNotificationCounts([recipientId], auth.token);
      assertNoGraphQLErrors(count);
      assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 0);
    } finally {
      if (!unlocked) {
        await control`SELECT pg_advisory_unlock(${advisoryKey})`;
        unlocked = true;
      }
      // If setup or the blocking poll failed, let the in-flight source action
      // finish before dropping its test-only trigger/function.
      await cancelPromise?.catch(() => undefined);
      await followPromise?.catch(() => undefined);
      if (triggerInstalled) {
        await db.execute(
          sql`DROP TRIGGER IF EXISTS follow_request_notification_race ON ${Notifications}`,
        );
      }
      if (functionInstalled) {
        await db.execute(sql`DROP FUNCTION IF EXISTS block_follow_request_notification_insert()`);
      }
      control.release();
    }
  });

  test('hides unavailable FOLLOW_REQUEST rows from Node, connection, count and Read', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-hidden-recipient');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);

    const visibleRequester = await createProfile('follow-request-visible-requester');
    const visibleRequest = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: visibleRequester.id })
      .returning()
      .then(firstOrThrow);
    const visibleNotification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: visibleRequest.id,
      })
      .returning()
      .then(firstOrThrow);

    const hiddenRequester = await createProfile('follow-request-hidden-requester');
    const hiddenRequest = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: hiddenRequester.id })
      .returning()
      .then(firstOrThrow);
    const hiddenNotification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: hiddenRequest.id,
      })
      .returning()
      .then(firstOrThrow);

    const mismatchedFollowee = await createProfile('follow-request-mismatched-followee');
    const mismatchedRequest = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: mismatchedFollowee.id, followerProfileId: visibleRequester.id })
      .returning()
      .then(firstOrThrow);
    const mismatchedNotification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: mismatchedRequest.id,
      })
      .returning()
      .then(firstOrThrow);

    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);
    const deletedRequester = await createProfile('follow-request-deleted-requester');
    const deletedRequest = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: deletedRequester.id })
      .returning()
      .then(firstOrThrow);
    const deletedNotification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientProfileId: recipient.id,
        sourceId: deletedRequest.id,
      })
      .returning()
      .then(firstOrThrow);
    await db.delete(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, deletedRequest.id));
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenRequester.id));

    const ids = [
      visibleNotification,
      hiddenNotification,
      mismatchedNotification,
      missingSource,
      deletedNotification,
    ].map(({ id }) => encodeGlobalId('FollowRequestNotification', id));
    const recipientId = encodeGlobalId('Profile', recipient.id);

    assert.deepEqual(
      await loadNodes(ids.slice(1), auth.token),
      ids.slice(1).map(() => null),
    );
    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => node.id),
      [ids[0]],
    );
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 1);

    for (const id of ids.slice(1)) {
      const result = await markNotificationRead([id], auth.token);
      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.markNotificationRead, {
        notifications: [],
        recipientProfiles: [],
      });
    }
    assert.deepEqual(
      await Promise.all(
        [hiddenNotification, mismatchedNotification, missingSource, deletedNotification].map(
          ({ id }) => notificationReadAt(id),
        ),
      ),
      [null, null, null, null],
    );
  });

  test('resolves Reply sources for concrete source fields', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('reply-batch-recipient');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const parent = await createContentPost(recipient.id);
    const replies = await Promise.all(
      ['first', 'second', 'third'].map(async (name) => {
        const author = await createProfile(`reply-batch-${name}`);
        const reply = await db
          .insert(Posts)
          .values({
            profileId: author.id,
            replyParentId: parent.id,
            state: PostState.ACTIVE,
            visibility: PostVisibility.PUBLIC,
          })
          .returning()
          .then(firstOrThrow);
        await db.insert(Notifications).values({
          kind: NotificationKind.REPLY,
          recipientProfileId: recipient.id,
          sourceId: reply.id,
        });
        return { author, reply };
      }),
    );
    const recipientId = encodeGlobalId('Profile', recipient.id);

    const concrete = await requestGraphQL<{
      node: { notifications: NotificationConnection } | null;
    }>(
      `query ReplyNotificationConcreteSources($id: ID!) {
        node(id: $id) {
          ... on Profile {
            notifications(first: 10) {
              edges { node { __typename id ... on ReplyNotification { profile { id } post { id } } } }
            }
          }
        }
      }`,
      { id: recipientId },
      auth.token,
    );
    assertNoGraphQLErrors(concrete);
    assert.deepEqual(
      concrete.data?.node?.notifications.edges.map(({ node }) => node.post?.id).sort(),
      replies.map(({ reply }) => encodeGlobalId('Post', reply.id)).sort(),
    );
    assert.deepEqual(
      concrete.data?.node?.notifications.edges.map(({ node }) => node.profile.id).sort(),
      replies.map(({ author }) => encodeGlobalId('Profile', author.id)).sort(),
    );
  });

  test('keeps Reply Workflow projection post-commit, suppresses self/invisible sources, and isolates insert failure', async () => {
    const author = await createAuthenticatedSession();
    const recipient = await createProfile('reply-create-recipient');
    const parent = await createContentPost(recipient.id);
    const created = await requestCreateReply(parent.id, author.token);
    assertNoGraphQLErrors(created);
    const reply = await db
      .select()
      .from(Posts)
      .where(eq(Posts.replyParentId, parent.id))
      .then(firstOrThrow);
    assert.equal(
      await db.$count(
        Notifications,
        and(eq(Notifications.kind, NotificationKind.REPLY), eq(Notifications.sourceId, reply.id)),
      ),
      0,
    );
    await createReplyNotification(reply.id);
    assert.equal(
      await db.$count(
        Notifications,
        and(eq(Notifications.kind, NotificationKind.REPLY), eq(Notifications.sourceId, reply.id)),
      ),
      1,
    );
    const selfParent = await createContentPost(author.profile.id);
    assertNoGraphQLErrors(await requestCreateReply(selfParent.id, author.token));
    const invisibleParent = await createContentPost(recipient.id);
    assertNoGraphQLErrors(
      await requestCreateReply(invisibleParent.id, author.token, PostVisibility.FOLLOWERS),
    );
    assert.equal(await db.$count(Notifications, eq(Notifications.kind, NotificationKind.REPLY)), 1);
    await pg.unsafe(
      `CREATE FUNCTION fail_reply_notification_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'REPLY' THEN RAISE EXCEPTION 'forced'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reply_notification_insert BEFORE INSERT ON notification FOR EACH ROW EXECUTE FUNCTION fail_reply_notification_insert();`,
    );
    try {
      const failureParent = await createContentPost(recipient.id);
      assertNoGraphQLErrors(await requestCreateReply(failureParent.id, author.token));
      const failureReply = await db
        .select()
        .from(Posts)
        .where(eq(Posts.replyParentId, failureParent.id))
        .then(firstOrThrow);
      await assert.rejects(createReplyNotification(failureReply.id));
      assert.equal(await db.$count(Posts, eq(Posts.replyParentId, failureParent.id)), 1);
    } finally {
      await pg.unsafe(
        `DROP TRIGGER IF EXISTS fail_reply_notification_insert ON notification; DROP FUNCTION IF EXISTS fail_reply_notification_insert();`,
      );
    }
  });

  test('Local Reply 작성부터 thread 반영·inbox·Read·결과 Reply 이동 대상까지 수직 흐름을 유지한다', async () => {
    const parentAuthor = await createAuthenticatedSession();
    const replyAuthor = await createAuthenticatedSession();
    const parent = await createContentPost(parentAuthor.profile.id);

    const created = await requestCreateReply(parent.id, replyAuthor.token, PostVisibility.UNLISTED);
    assertNoGraphQLErrors(created);
    const replyId = created.data?.createPost.post.id;
    assert.ok(replyId);
    const storedReply = await db
      .select()
      .from(Posts)
      .where(eq(Posts.replyParentId, parent.id))
      .then(firstOrThrow);
    await createReplyNotification(storedReply.id);

    const thread = await requestReplyDescendants(parent.id, parentAuthor.token);
    assertNoGraphQLErrors(thread);
    assert.deepEqual(
      thread.data?.node?.replyDescendants.edges.map(({ node }) => node.id),
      [replyId],
    );

    const recipientId = encodeGlobalId('Profile', parentAuthor.profile.id);
    const connection = await loadNotificationConnection(recipientId, parentAuthor.token, {
      first: 10,
    });
    assertNoGraphQLErrors(connection);
    const notification = connection.data?.node?.notifications.edges[0]?.node;
    assert.equal(notification?.__typename, 'ReplyNotification');
    assert.equal(notification?.profile.id, encodeGlobalId('Profile', replyAuthor.profile.id));
    assert.equal(notification?.post?.id, replyId);

    const count = await loadUnreadNotificationCounts([recipientId], parentAuthor.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 1);

    assert.ok(notification);
    const read = await markNotificationRead([notification.id], parentAuthor.token);
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.notifications[0]?.id, notification.id);
    assert.equal(read.data?.markNotificationRead.notifications[0]?.post?.id, replyId);
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.id, recipientId);
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(read.data?.markNotificationRead.notifications[0]?.readAt);
  });

  test('filters unavailable Reply Notifications before pagination and from Read', async () => {
    const viewer = await createAuthenticatedSession();
    const recipient = await createProfile('reply-hidden-recipient');
    await addMembership(viewer.account.id, recipient.id, AccountProfileRole.OWNER);
    const parent = await createContentPost(recipient.id);
    const visibleAuthor = await createAuthenticatedSession();
    assertNoGraphQLErrors(await requestCreateReply(parent.id, visibleAuthor.token));
    const visible = await db
      .select()
      .from(Posts)
      .where(eq(Posts.replyParentId, parent.id))
      .then(firstOrThrow);
    await createReplyNotification(visible.id);
    const hiddenAuthor = await createAuthenticatedSession();
    assertNoGraphQLErrors(await requestCreateReply(parent.id, hiddenAuthor.token));
    const hidden = await db
      .select()
      .from(Posts)
      .where(and(eq(Posts.replyParentId, parent.id), ne(Posts.id, visible.id)))
      .then(firstOrThrow);
    await createReplyNotification(hidden.id);
    const visibleNotification = await db
      .select()
      .from(Notifications)
      .where(
        and(eq(Notifications.kind, NotificationKind.REPLY), eq(Notifications.sourceId, visible.id)),
      )
      .then(firstOrThrow);
    const hiddenNotification = await db
      .select()
      .from(Notifications)
      .where(
        and(eq(Notifications.kind, NotificationKind.REPLY), eq(Notifications.sourceId, hidden.id)),
      )
      .then(firstOrThrow);
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenAuthor.profile.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const connection = await loadNotificationConnection(recipientId, viewer.token, { first: 1 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('ReplyNotification', visibleNotification.id)],
    );
    const hiddenId = encodeGlobalId('ReplyNotification', hiddenNotification.id);
    assert.deepEqual(await loadNodes([hiddenId], viewer.token), [null]);
    const read = await markNotificationRead([hiddenId], viewer.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(read.data?.markNotificationRead, {
      notifications: [],
      recipientProfiles: [],
    });
    assert.equal(await notificationReadAt(hiddenNotification.id), null);
  });

  test('keeps a created Reply in Node, connection, unread count and Read after Parent Tombstone', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('reply-tombstone-recipient');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const parent = await createContentPost(recipient.id);
    const created = await requestCreateReply(parent.id, auth.token);
    assertNoGraphQLErrors(created);
    const reply = await db
      .select()
      .from(Posts)
      .where(eq(Posts.replyParentId, parent.id))
      .then(firstOrThrow);
    await createReplyNotification(reply.id);
    const notification = await db
      .select()
      .from(Notifications)
      .where(
        and(eq(Notifications.kind, NotificationKind.REPLY), eq(Notifications.sourceId, reply.id)),
      )
      .then(firstOrThrow);
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, parent.id));

    const result = await requestGraphQL<{ node: NotificationNode | null }>(
      `query TombstoneParentReplyNotification($id: ID!) {
        node(id: $id) { __typename ... on ReplyNotification { profile { id } post { id } } }
      }`,
      { id: encodeGlobalId('ReplyNotification', notification.id) },
      auth.token,
    );
    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.__typename, 'ReplyNotification');
    assert.equal(result.data?.node?.post?.id, encodeGlobalId('Post', reply.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('ReplyNotification', notification.id)],
    );
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 1);
    const read = await markNotificationRead(
      [encodeGlobalId('ReplyNotification', notification.id)],
      auth.token,
    );
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
  });

  test('uses every membership role without depending on the selected Profile', async () => {
    const auth = await createAuthenticatedSession();
    const notificationIds: string[] = [];

    for (const role of Object.values(AccountProfileRole)) {
      const recipient = await createProfile(`recipient-${role.toLowerCase()}`);
      const related = await createProfile(`related-${role.toLowerCase()}`);
      await addMembership(auth.account.id, recipient.id, role);
      notificationIds.push(
        encodeGlobalId(
          'FollowNotification',
          (await createFollowNotification(recipient.id, related.id)).id,
        ),
      );
    }

    const selectedElsewhere = await loadNodes(notificationIds, auth.token);
    assert.deepEqual(
      selectedElsewhere.map((node) => node?.id),
      notificationIds,
    );

    await db
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.id, auth.session.id));
    const withoutSelection = await loadNodes(notificationIds, auth.token);
    assert.deepEqual(
      withoutSelection.map((node) => node?.id),
      notificationIds,
    );

    const unrelated = await createAuthenticatedSession();
    assert.deepEqual(
      await loadNodes(notificationIds, unrelated.token),
      notificationIds.map(() => null),
    );
  });

  test('integrates Reaction rows into Node, mixed list, unread count and Read', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('reaction-recipient');
    const author = await createProfile('reaction-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const follow = await createFollowNotification(recipient.id, author.id);
    const reaction = await createReactionNotification(recipient.id, author.id, '🎉');
    await db
      .update(Posts)
      .set({ visibility: PostVisibility.DIRECT })
      .where(eq(Posts.id, reaction.post.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const reactionId = encodeGlobalId('ReactionNotification', reaction.notification.id);

    const node = await requestGraphQL<{ node: NotificationNode | null }>(
      `query ReactionNotificationNode($id: ID!) {
        node(id: $id) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on ReactionNotification { type profile { id } post { id } }
        }
      }`,
      { id: reactionId },
      auth.token,
    );
    assertNoGraphQLErrors(node);
    assert.equal(node.data?.node?.__typename, 'ReactionNotification');
    assert.equal(node.data?.node?.type, '🎉');
    assert.equal(node.data?.node?.profile.id, encodeGlobalId('Profile', author.id));
    assert.equal(node.data?.node?.post?.id, encodeGlobalId('Post', reaction.post.id));

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      new Set(connection.data?.node?.notifications.edges.map(({ node }) => node.__typename)),
      new Set(['FollowNotification', 'ReactionNotification']),
    );

    const initialCount = await loadUnreadNotificationCounts([recipientId], auth.token);
    assert.equal(initialCount.data?.nodes[0]?.unreadNotificationCount, 2);

    const read = await markNotificationRead([reactionId], auth.token);
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.notifications[0]?.id, reactionId);
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 1);
    assert.equal(await notificationReadAt(follow.id), null);
  });

  test('integrates Repost rows into concrete Node, mixed list, unread count and Read', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('repost-recipient');
    const author = await createProfile('repost-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const follow = await createFollowNotification(recipient.id, author.id);
    const reaction = await createReactionNotification(recipient.id, author.id, '🎉');
    const repost = await createRepostNotification(recipient.id, author.id);
    await db
      .update(Posts)
      .set({ visibility: PostVisibility.DIRECT })
      .where(eq(Posts.id, repost.post.id));
    await db
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.id, auth.session.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const repostId = encodeGlobalId('RepostNotification', repost.notification.id);

    const node = await requestGraphQL<{ node: NotificationNode | null }>(
      `query RepostNotificationNode($id: ID!) {
        node(id: $id) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on RepostNotification { profile { id } post { id } }
        }
      }`,
      { id: repostId },
      auth.token,
    );
    assertNoGraphQLErrors(node);
    assert.equal(node.data?.node?.__typename, 'RepostNotification');
    assert.equal(node.data?.node?.profile.id, encodeGlobalId('Profile', author.id));
    assert.equal(node.data?.node?.post?.id, encodeGlobalId('Post', repost.post.id));

    const wrongConcreteType = await loadNodes(
      [encodeGlobalId('ReactionNotification', repost.notification.id)],
      auth.token,
    );
    assert.deepEqual(wrongConcreteType, [null]);

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      new Set(connection.data?.node?.notifications.edges.map(({ node }) => node.__typename)),
      new Set(['FollowNotification', 'ReactionNotification', 'RepostNotification']),
    );

    const initialCount = await loadUnreadNotificationCounts([recipientId], auth.token);
    assert.equal(initialCount.data?.nodes[0]?.unreadNotificationCount, 3);

    const read = await markNotificationRead([repostId], auth.token);
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.notifications[0]?.id, repostId);
    assert.equal(
      read.data?.markNotificationRead.notifications[0]?.profile.id,
      encodeGlobalId('Profile', author.id),
    );
    assert.equal(
      read.data?.markNotificationRead.notifications[0]?.post?.id,
      encodeGlobalId('Post', repost.post.id),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 2);
    assert.equal(await notificationReadAt(follow.id), null);
    assert.equal(await notificationReadAt(reaction.notification.id), null);
  });

  test('counts unread notifications for every membership role without using the selected Profile', async () => {
    const auth = await createAuthenticatedSession();
    const profileIds: string[] = [];

    for (const role of Object.values(AccountProfileRole)) {
      const recipient = await createProfile(`count-recipient-${role.toLowerCase()}`);
      const related = await createProfile(`count-related-${role.toLowerCase()}`);
      await addMembership(auth.account.id, recipient.id, role);
      await createFollowNotification(recipient.id, related.id);
      profileIds.push(encodeGlobalId('Profile', recipient.id));
    }

    const selectedElsewhere = await loadUnreadNotificationCounts(profileIds, auth.token);
    assertNoGraphQLErrors(selectedElsewhere);
    assert.deepEqual(
      selectedElsewhere.data?.nodes.map((profile) => profile?.unreadNotificationCount),
      profileIds.map(() => 1),
    );

    await db
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.id, auth.session.id));
    const withoutSelection = await loadUnreadNotificationCounts(profileIds, auth.token);
    assertNoGraphQLErrors(withoutSelection);
    assert.deepEqual(
      withoutSelection.data?.nodes.map((profile) => profile?.unreadNotificationCount),
      profileIds.map(() => 1),
    );

    const unrelated = await createAuthenticatedSession();
    const withoutMembership = await loadUnreadNotificationCounts(profileIds, unrelated.token);
    assert.deepEqual(
      withoutMembership.data?.nodes,
      profileIds.map(() => null),
    );
    assert.equal(withoutMembership.errors?.length, profileIds.length);
    assert.ok(
      withoutMembership.errors?.every(({ extensions }) => extensions?.code === 'PERMISSION_DENIED'),
    );

    const unauthenticated = await loadUnreadNotificationCounts([profileIds[0]!]);
    assert.deepEqual(unauthenticated.data?.nodes, [null]);
    assert.equal(unauthenticated.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  });

  test('counts only visible unread notifications', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('count-visible-recipient');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const visibleRelated = await createProfile('count-visible-related');
    await createFollowNotification(recipient.id, visibleRelated.id);
    const readRelated = await createProfile('count-read-related');
    const readNotification = await createFollowNotification(recipient.id, readRelated.id);
    await db
      .update(Notifications)
      .set({ readAt: Temporal.Now.instant() })
      .where(eq(Notifications.id, readNotification.id));

    await db.insert(Notifications).values({
      kind: NotificationKind.FOLLOW,
      recipientProfileId: recipient.id,
      sourceId: crypto.randomUUID(),
    });

    const actualFollowee = await createProfile('count-actual-followee');
    const mismatchRelated = await createProfile('count-mismatch-related');
    const mismatchSource = await createFollow(actualFollowee.id, mismatchRelated.id);
    await db.insert(Notifications).values({
      kind: NotificationKind.FOLLOW,
      recipientProfileId: recipient.id,
      sourceId: mismatchSource.id,
    });

    const hiddenRelated = await createProfile('count-hidden-related');
    await createFollowNotification(recipient.id, hiddenRelated.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenRelated.id));

    const result = await loadUnreadNotificationCounts(
      [encodeGlobalId('Profile', recipient.id)],
      auth.token,
    );
    assertNoGraphQLErrors(result);
    assert.equal(result.data?.nodes[0]?.unreadNotificationCount, 1);

    const inactiveRecipient = await createProfile('count-inactive-recipient');
    const inactiveRelated = await createProfile('count-inactive-related');
    await addMembership(auth.account.id, inactiveRecipient.id, AccountProfileRole.OWNER);
    await createFollowNotification(inactiveRecipient.id, inactiveRelated.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, inactiveRecipient.id));

    const inactiveResult = await loadUnreadNotificationCounts(
      [encodeGlobalId('Profile', inactiveRecipient.id)],
      auth.token,
    );
    assertNoGraphQLErrors(inactiveResult);
    assert.deepEqual(inactiveResult.data?.nodes, [null]);
  });

  test('lists notifications for every membership role without using the selected Profile', async () => {
    const auth = await createAuthenticatedSession();
    const profileIds: string[] = [];

    for (const role of Object.values(AccountProfileRole)) {
      const recipient = await createProfile(`list-recipient-${role.toLowerCase()}`);
      const related = await createProfile(`list-related-${role.toLowerCase()}`);
      await addMembership(auth.account.id, recipient.id, role);
      await createFollowNotification(recipient.id, related.id);
      profileIds.push(encodeGlobalId('Profile', recipient.id));
    }

    for (const profileId of profileIds) {
      const result = await loadNotificationConnection(profileId, auth.token, { first: 10 });
      assertNoGraphQLErrors(result);
      assert.equal(result.data?.node?.notifications.edges.length, 1);
      assert.equal(
        result.data?.node?.notifications.edges[0]?.node.__typename,
        'FollowNotification',
      );
    }

    await db
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.id, auth.session.id));
    const withoutSelection = await loadNotificationConnection(profileIds[0]!, auth.token, {
      first: 10,
    });
    assertNoGraphQLErrors(withoutSelection);
    assert.equal(withoutSelection.data?.node?.notifications.edges.length, 1);

    const unrelated = await createAuthenticatedSession();
    const withoutMembership = await loadNotificationConnection(profileIds[0]!, unrelated.token, {
      first: 10,
    });
    assert.equal(withoutMembership.data?.node, null);
    assert.equal(withoutMembership.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const unauthenticated = await loadNotificationConnection(profileIds[0]!, undefined, {
      first: 10,
    });
    assert.equal(unauthenticated.data?.node, null);
    assert.equal(unauthenticated.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const inactiveRecipient = await createProfile('list-inactive-recipient');
    const inactiveRelated = await createProfile('list-inactive-related');
    await addMembership(auth.account.id, inactiveRecipient.id, AccountProfileRole.OWNER);
    await createFollowNotification(inactiveRecipient.id, inactiveRelated.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, inactiveRecipient.id));
    const inactiveResult = await loadNotificationConnection(
      encodeGlobalId('Profile', inactiveRecipient.id),
      auth.token,
      { first: 10 },
    );
    assertNoGraphQLErrors(inactiveResult);
    assert.equal(inactiveResult.data?.node, null);
  });

  test('paginates visible notifications by ID after filtering hidden rows', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('page-recipient');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const newestRelated = await createProfile('page-newest-related');
    const newest = await createFollowNotification(
      recipient.id,
      newestRelated.id,
      '00000000-0000-8006-8000-000000000900',
    );

    await db.insert(Notifications).values({
      id: '00000000-0000-8006-8000-000000000800',
      kind: NotificationKind.FOLLOW,
      recipientProfileId: recipient.id,
      sourceId: crypto.randomUUID(),
    });

    const readRelated = await createProfile('page-read-related');
    const read = await createFollowNotification(
      recipient.id,
      readRelated.id,
      '00000000-0000-8006-8000-000000000700',
    );
    const readResult = await markNotificationRead(
      [encodeGlobalId('FollowNotification', read.id)],
      auth.token,
    );
    assertNoGraphQLErrors(readResult);

    const actualFollowee = await createProfile('page-actual-followee');
    const mismatchRelated = await createProfile('page-mismatch-related');
    const mismatchSource = await createFollow(actualFollowee.id, mismatchRelated.id);
    await db.insert(Notifications).values({
      id: '00000000-0000-8006-8000-000000000600',
      kind: NotificationKind.FOLLOW,
      recipientProfileId: recipient.id,
      sourceId: mismatchSource.id,
    });

    const oldestRelated = await createProfile('page-oldest-related');
    const oldest = await createFollowNotification(
      recipient.id,
      oldestRelated.id,
      '00000000-0000-8006-8000-000000000500',
    );

    const hiddenRelated = await createProfile('page-hidden-related');
    await createFollowNotification(
      recipient.id,
      hiddenRelated.id,
      '00000000-0000-8006-8000-000000000400',
    );
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenRelated.id));

    const profileId = encodeGlobalId('Profile', recipient.id);
    const first = await loadNotificationConnection(profileId, auth.token, { first: 2 });
    assertNoGraphQLErrors(first);
    const firstConnection = first.data?.node?.notifications;
    assert.deepEqual(
      firstConnection?.edges.map(({ node }) => node.id),
      [newest.id, read.id].map((id) => encodeGlobalId('FollowNotification', id)),
    );
    assert.equal(
      firstConnection?.edges[1]?.node.profile.id,
      encodeGlobalId('Profile', readRelated.id),
    );
    assert.ok(firstConnection?.edges[1]?.node.readAt);
    assert.equal(firstConnection?.pageInfo.hasNextPage, true);
    assert.equal(firstConnection?.pageInfo.endCursor, firstConnection?.edges[1]?.cursor);

    const second = await loadNotificationConnection(profileId, auth.token, {
      after: firstConnection?.pageInfo.endCursor,
      first: 2,
    });
    assertNoGraphQLErrors(second);
    const secondConnection = second.data?.node?.notifications;
    assert.deepEqual(
      secondConnection?.edges.map(({ node }) => node.id),
      [encodeGlobalId('FollowNotification', oldest.id)],
    );
    assert.equal(
      secondConnection?.edges[0]?.node.profile.id,
      encodeGlobalId('Profile', oldestRelated.id),
    );
    assert.equal(secondConnection?.pageInfo.hasNextPage, false);
  });

  test('paginates mixed kinds after filtering a hidden Repost before the limit', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('mixed-page-recipient');
    const author = await createProfile('mixed-page-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const newest = await createFollowNotification(
      recipient.id,
      author.id,
      '00000000-0000-8006-8000-000000000900',
    );
    await db.insert(Notifications).values({
      id: '00000000-0000-8006-8000-000000000800',
      kind: NotificationKind.REPOST,
      recipientProfileId: recipient.id,
      sourceId: crypto.randomUUID(),
    });
    const reaction = await createReactionNotification(
      recipient.id,
      author.id,
      '👀',
      '00000000-0000-8006-8000-000000000700',
    );
    const repost = await createRepostNotification(
      recipient.id,
      author.id,
      '00000000-0000-8006-8000-000000000600',
    );
    const oldest = await createFollowNotification(
      recipient.id,
      await createProfile('mixed-page-oldest-author').then(({ id }) => id),
      '00000000-0000-8006-8000-000000000500',
    );
    const profileId = encodeGlobalId('Profile', recipient.id);

    const first = await loadNotificationConnection(profileId, auth.token, { first: 2 });
    assertNoGraphQLErrors(first);
    const firstConnection = first.data?.node?.notifications;
    assert.deepEqual(
      firstConnection?.edges.map(({ node }) => [node.__typename, node.id]),
      [
        ['FollowNotification', encodeGlobalId('FollowNotification', newest.id)],
        ['ReactionNotification', encodeGlobalId('ReactionNotification', reaction.notification.id)],
      ],
    );
    assert.equal(firstConnection?.pageInfo.hasNextPage, true);

    const second = await loadNotificationConnection(profileId, auth.token, {
      after: firstConnection?.pageInfo.endCursor,
      first: 2,
    });
    assertNoGraphQLErrors(second);
    assert.deepEqual(
      second.data?.node?.notifications.edges.map(({ node }) => [node.__typename, node.id]),
      [
        ['RepostNotification', encodeGlobalId('RepostNotification', repost.notification.id)],
        ['FollowNotification', encodeGlobalId('FollowNotification', oldest.id)],
      ],
    );
    assert.equal(second.data?.node?.notifications.pageInfo.hasNextPage, false);
  });

  test('does not infer a Notification type from a mismatched concrete global ID', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('mismatched-recipient');
    const related = await createProfile('mismatched-related');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const notification = await createFollowNotification(recipient.id, related.id);
    const result = await requestGraphQL<{ node: ProfileNode | null }>(
      `query MismatchedNotification($id: ID!) {
        node(id: $id) { __typename ... on Profile { id } }
      }`,
      { id: encodeGlobalId('Profile', notification.id) },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node, null);
  });

  test('hides notifications when the shared visible predicate fails', async () => {
    const auth = await createAuthenticatedSession();

    const inactiveRecipient = await createProfile('inactive-recipient');
    const inactiveRecipientRelated = await createProfile('inactive-recipient-related');
    await addMembership(auth.account.id, inactiveRecipient.id, AccountProfileRole.OWNER);
    const inactiveRecipientNotification = await createFollowNotification(
      inactiveRecipient.id,
      inactiveRecipientRelated.id,
    );
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, inactiveRecipient.id));

    const missingSourceRecipient = await createProfile('missing-source-recipient');
    await addMembership(auth.account.id, missingSourceRecipient.id, AccountProfileRole.OWNER);
    const missingSourceNotification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientProfileId: missingSourceRecipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const mismatchRecipient = await createProfile('mismatch-recipient');
    const actualFollowee = await createProfile('actual-followee');
    const mismatchRelated = await createProfile('mismatch-related');
    await addMembership(auth.account.id, mismatchRecipient.id, AccountProfileRole.OWNER);
    const mismatchSource = await createFollow(actualFollowee.id, mismatchRelated.id);
    const mismatchNotification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientProfileId: mismatchRecipient.id,
        sourceId: mismatchSource.id,
      })
      .returning()
      .then(firstOrThrow);

    const hiddenRelatedRecipient = await createProfile('hidden-related-recipient');
    const hiddenRelated = await createProfile('hidden-related');
    await addMembership(auth.account.id, hiddenRelatedRecipient.id, AccountProfileRole.OWNER);
    const hiddenRelatedNotification = await createFollowNotification(
      hiddenRelatedRecipient.id,
      hiddenRelated.id,
    );
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenRelated.id));

    const ids = [
      inactiveRecipientNotification.id,
      missingSourceNotification.id,
      mismatchNotification.id,
      hiddenRelatedNotification.id,
    ].map((id) => encodeGlobalId('FollowNotification', id));
    assert.deepEqual(
      await loadNodes(ids, auth.token),
      ids.map(() => null),
    );
  });

  test('hides unavailable Reaction notifications from every API surface', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('reaction-hidden-recipient');
    const author = await createProfile('reaction-hidden-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.REACTION,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const actualRecipient = await createProfile('reaction-actual-recipient');
    const mismatchSource = await createReactionNotification(actualRecipient.id, author.id, '👀');
    const mismatch = await db
      .update(Notifications)
      .set({ recipientProfileId: recipient.id })
      .where(eq(Notifications.id, mismatchSource.notification.id))
      .returning()
      .then(firstOrThrow);

    const deletedPost = await createReactionNotification(recipient.id, author.id, '👍');
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(eq(Posts.id, deletedPost.post.id));

    const hiddenAuthor = await createProfile('reaction-suspended-author');
    const hidden = await createReactionNotification(recipient.id, hiddenAuthor.id, '🎉');
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenAuthor.id));

    const notifications = [missingSource, mismatch, deletedPost.notification, hidden.notification];
    const ids = notifications.map(({ id }) => encodeGlobalId('ReactionNotification', id));
    const recipientId = encodeGlobalId('Profile', recipient.id);

    assert.deepEqual(
      await loadNodes(ids, auth.token),
      ids.map(() => null),
    );

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(connection.data?.node?.notifications.edges, []);

    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 0);

    for (const id of ids) {
      const result = await markNotificationRead([id], auth.token);
      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.markNotificationRead, {
        notifications: [],
        recipientProfiles: [],
      });
    }
    assert.deepEqual(
      await Promise.all(notifications.map(({ id }) => notificationReadAt(id))),
      notifications.map(() => null),
    );
  });

  test('hides unavailable Repost notifications from every API surface', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('repost-hidden-recipient');
    const author = await createProfile('repost-hidden-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.REPOST,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const actualRecipient = await createProfile('repost-actual-recipient');
    const mismatchSource = await createRepostNotification(actualRecipient.id, author.id);
    const mismatch = await db
      .update(Notifications)
      .set({ recipientProfileId: recipient.id })
      .where(eq(Notifications.id, mismatchSource.notification.id))
      .returning()
      .then(firstOrThrow);

    const tombstone = await createRepostNotification(recipient.id, author.id);
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(eq(Posts.id, tombstone.repost.id));

    const malformed = await createRepostNotification(recipient.id, author.id);
    const replyParent = await createContentPost(author.id);
    await db
      .update(Posts)
      .set({ replyParentId: replyParent.id })
      .where(eq(Posts.id, malformed.repost.id));

    const deletedRelatedPost = await createRepostNotification(recipient.id, author.id);
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(eq(Posts.id, deletedRelatedPost.post.id));

    const suspendedAuthor = await createProfile('repost-suspended-author');
    const hiddenAuthor = await createRepostNotification(recipient.id, suspendedAuthor.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, suspendedAuthor.id));

    const notifications = [
      missingSource,
      mismatch,
      tombstone.notification,
      malformed.notification,
      deletedRelatedPost.notification,
      hiddenAuthor.notification,
    ];
    const ids = notifications.map(({ id }) => encodeGlobalId('RepostNotification', id));
    const recipientId = encodeGlobalId('Profile', recipient.id);

    assert.deepEqual(
      await loadNodes(ids, auth.token),
      ids.map(() => null),
    );

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(connection.data?.node?.notifications.edges, []);

    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 0);

    for (const id of ids) {
      const result = await markNotificationRead([id], auth.token);
      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.markNotificationRead, {
        notifications: [],
        recipientProfiles: [],
      });
    }
    assert.deepEqual(
      await Promise.all(notifications.map(({ id }) => notificationReadAt(id))),
      notifications.map(() => null),
    );
  });

  test('marks only distinct specified visible Notifications across Recipient Profiles', async () => {
    const auth = await createAuthenticatedSession();
    const firstRecipient = await createProfile('batch-first-recipient');
    const secondRecipient = await createProfile('batch-second-recipient');
    const firstRelated = await createProfile('batch-first-related');
    const secondRelated = await createProfile('batch-second-related');
    const unlistedRelated = await createProfile('batch-unlisted-related');
    await addMembership(auth.account.id, firstRecipient.id, AccountProfileRole.MEMBER);
    await addMembership(auth.account.id, secondRecipient.id, AccountProfileRole.OWNER);
    const first = await createFollowNotification(firstRecipient.id, firstRelated.id);
    const second = await createFollowNotification(secondRecipient.id, secondRelated.id);
    const unlisted = await createFollowNotification(firstRecipient.id, unlistedRelated.id);
    const wrongConcrete = await createRepostNotification(firstRecipient.id, firstRelated.id);
    const firstId = encodeGlobalId('FollowNotification', first.id);
    const secondId = encodeGlobalId('FollowNotification', second.id);
    const wrongConcreteId = encodeGlobalId('ReactionNotification', wrongConcrete.notification.id);
    const firstRecipientId = encodeGlobalId('Profile', firstRecipient.id);
    const secondRecipientId = encodeGlobalId('Profile', secondRecipient.id);

    const result = await markNotificationRead(
      [firstId, firstId, secondId, wrongConcreteId],
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(
      new Set(result.data?.markNotificationRead.notifications.map(({ id }) => id)),
      new Set([firstId, secondId]),
    );
    const recipientCounts = new Map(
      result.data?.markNotificationRead.recipientProfiles.map(({ id, unreadNotificationCount }) => [
        id,
        unreadNotificationCount,
      ]),
    );
    assert.deepEqual(
      recipientCounts,
      new Map([
        [firstRecipientId, 2],
        [secondRecipientId, 0],
      ]),
    );
    assert.ok(await notificationReadAt(first.id));
    assert.ok(await notificationReadAt(second.id));
    assert.equal(await notificationReadAt(unlisted.id), null);
    assert.equal(await notificationReadAt(wrongConcrete.notification.id), null);
  });

  test('marks a visible Notification Read once without depending on the selected Profile', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('read-recipient');
    const related = await createProfile('read-related');
    const otherRelated = await createProfile('other-unread-related');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    const notification = await createFollowNotification(recipient.id, related.id);
    const otherNotification = await createFollowNotification(recipient.id, otherRelated.id);
    await db
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.id, auth.session.id));

    const initialCount = await loadUnreadNotificationCounts(
      [encodeGlobalId('Profile', recipient.id)],
      auth.token,
    );
    assertNoGraphQLErrors(initialCount);
    assert.equal(initialCount.data?.nodes[0]?.unreadNotificationCount, 2);
    const id = encodeGlobalId('FollowNotification', notification.id);
    const first = await markNotificationRead([id], auth.token);
    assertNoGraphQLErrors(first);
    assert.equal(first.data?.markNotificationRead.notifications[0]?.id, id);
    assert.equal(
      first.data?.markNotificationRead.notifications[0]?.profile.id,
      encodeGlobalId('Profile', related.id),
    );
    assert.equal(
      first.data?.markNotificationRead.recipientProfiles[0]?.id,
      encodeGlobalId('Profile', recipient.id),
    );
    assert.ok(first.data?.markNotificationRead.notifications[0]?.readAt);
    assert.equal(first.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 1);

    const repeated = await markNotificationRead([id], auth.token);
    assertNoGraphQLErrors(repeated);
    assert.equal(
      repeated.data?.markNotificationRead.notifications[0]?.readAt,
      first.data?.markNotificationRead.notifications[0]?.readAt,
    );
    assert.equal(
      repeated.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount,
      1,
    );
    assert.equal(await notificationReadAt(otherNotification.id), null);
  });

  test('preserves the same first readAt across concurrent Read requests', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('concurrent-recipient');
    const related = await createProfile('concurrent-related');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    const notification = await createFollowNotification(recipient.id, related.id);
    const id = encodeGlobalId('FollowNotification', notification.id);

    const results = await Promise.all([
      markNotificationRead([id], auth.token),
      markNotificationRead([id], auth.token),
    ]);
    results.forEach(assertNoGraphQLErrors);
    const readAt = results.map(
      (result) => result.data?.markNotificationRead.notifications[0]?.readAt,
    );
    assert.ok(readAt[0]);
    assert.equal(readAt[1], readAt[0]);
    assert.deepEqual(
      results.map(
        (result) => result.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount,
      ),
      [0, 0],
    );
  });

  test('rolls back every specified Notification when the batch update fails', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('atomic-recipient');
    const firstRelated = await createProfile('atomic-first-related');
    const failingRelated = await createProfile('atomic-failing-related');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    const first = await createFollowNotification(recipient.id, firstRelated.id);
    const failing = await createFollowNotification(recipient.id, failingRelated.id);
    let functionInstalled = false;
    let triggerInstalled = false;

    try {
      await db.execute(
        sql.raw(`
          CREATE FUNCTION fail_selected_notification_read() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM notification_read_new_rows
              WHERE id = '${failing.id}'::uuid
            ) THEN
              RAISE EXCEPTION 'forced notification read failure';
            END IF;
            RETURN NULL;
          END;
          $$;
        `),
      );
      functionInstalled = true;
      await db.execute(
        sql.raw(`
          CREATE TRIGGER fail_selected_notification_read
          AFTER UPDATE ON "notification"
          REFERENCING NEW TABLE AS notification_read_new_rows
          FOR EACH STATEMENT
          EXECUTE FUNCTION fail_selected_notification_read()
        `),
      );
      triggerInstalled = true;

      const result = await markNotificationRead(
        [
          encodeGlobalId('FollowNotification', first.id),
          encodeGlobalId('FollowNotification', failing.id),
        ],
        auth.token,
      );

      assert.ok(result.errors?.length);
      assert.equal(result.errors?.[0]?.extensions?.code, 'INTERNAL_SERVER_ERROR');
      assert.equal(result.data?.markNotificationRead ?? null, null);
      assert.deepEqual(
        await Promise.all([notificationReadAt(first.id), notificationReadAt(failing.id)]),
        [null, null],
      );
    } finally {
      if (triggerInstalled) {
        await db.execute(
          sql`DROP TRIGGER IF EXISTS fail_selected_notification_read ON ${Notifications}`,
        );
      }
      if (functionInstalled) {
        await db.execute(sql`DROP FUNCTION IF EXISTS fail_selected_notification_read()`);
      }
    }
  });

  test('returns PERMISSION_DENIED for an unauthenticated Read', async () => {
    const recipient = await createProfile('unauthenticated-recipient');
    const related = await createProfile('unauthenticated-related');
    const notification = await createFollowNotification(recipient.id, related.id);

    const result = await markNotificationRead([
      encodeGlobalId('FollowNotification', notification.id),
    ]);
    assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(await notificationReadAt(notification.id), null);
  });

  test('silently excludes missing, unauthorized and hidden Notification Reads', async () => {
    const auth = await createAuthenticatedSession();

    const unauthorizedRecipient = await createProfile('unauthorized-recipient');
    const unauthorizedRelated = await createProfile('unauthorized-related');
    const unauthorized = await createFollowNotification(
      unauthorizedRecipient.id,
      unauthorizedRelated.id,
    );

    const inactiveRecipient = await createProfile('read-inactive-recipient');
    const inactiveRelated = await createProfile('read-inactive-related');
    await addMembership(auth.account.id, inactiveRecipient.id, AccountProfileRole.OWNER);
    const inactive = await createFollowNotification(inactiveRecipient.id, inactiveRelated.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, inactiveRecipient.id));

    const missingSourceRecipient = await createProfile('read-missing-source-recipient');
    await addMembership(auth.account.id, missingSourceRecipient.id, AccountProfileRole.OWNER);
    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientProfileId: missingSourceRecipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const mismatchRecipient = await createProfile('read-mismatch-recipient');
    const actualFollowee = await createProfile('read-actual-followee');
    const mismatchRelated = await createProfile('read-mismatch-related');
    await addMembership(auth.account.id, mismatchRecipient.id, AccountProfileRole.OWNER);
    const mismatchSource = await createFollow(actualFollowee.id, mismatchRelated.id);
    const mismatch = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientProfileId: mismatchRecipient.id,
        sourceId: mismatchSource.id,
      })
      .returning()
      .then(firstOrThrow);

    const hiddenRecipient = await createProfile('read-hidden-recipient');
    const hiddenRelated = await createProfile('read-hidden-related');
    await addMembership(auth.account.id, hiddenRecipient.id, AccountProfileRole.OWNER);
    const hidden = await createFollowNotification(hiddenRecipient.id, hiddenRelated.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenRelated.id));

    const visibleRecipient = await createProfile('read-visible-recipient');
    const visibleRelated = await createProfile('read-visible-related');
    await addMembership(auth.account.id, visibleRecipient.id, AccountProfileRole.MEMBER);
    const visible = await createFollowNotification(visibleRecipient.id, visibleRelated.id);
    const visibleId = encodeGlobalId('FollowNotification', visible.id);

    const unavailable = [unauthorized, inactive, missingSource, mismatch, hidden];
    const ids = [crypto.randomUUID(), ...unavailable.map(({ id }) => id)].map((id) =>
      encodeGlobalId('FollowNotification', id),
    );
    const mixed = await markNotificationRead(
      [...ids, encodeGlobalId('Profile', visibleRecipient.id), visibleId],
      auth.token,
    );
    assertNoGraphQLErrors(mixed);
    assert.deepEqual(
      mixed.data?.markNotificationRead.notifications.map(({ id }) => id),
      [visibleId],
    );
    assert.deepEqual(mixed.data?.markNotificationRead.recipientProfiles, [
      {
        id: encodeGlobalId('Profile', visibleRecipient.id),
        unreadNotificationCount: 0,
      },
    ]);
    assert.ok(await notificationReadAt(visible.id));

    const excluded = await markNotificationRead(ids, auth.token);
    assertNoGraphQLErrors(excluded);
    assert.deepEqual(excluded.data?.markNotificationRead, {
      notifications: [],
      recipientProfiles: [],
    });

    const empty = await markNotificationRead([], auth.token);
    assertNoGraphQLErrors(empty);
    assert.deepEqual(empty.data?.markNotificationRead, {
      notifications: [],
      recipientProfiles: [],
    });
    assert.deepEqual(
      await Promise.all(unavailable.map(({ id }) => notificationReadAt(id))),
      unavailable.map(() => null),
    );
  });
});

type NotificationNode = {
  __typename: string;
  createdAt: string;
  id: string;
  readAt: string | null;
  profile: { id: string };
  post?: { id: string };
  type?: string;
};

type NotificationConnection = {
  edges: Array<{ cursor: string; node: NotificationNode }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};

type ProfileNode = { __typename: 'Profile'; id: string };

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

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

const requestCreateReply = (
  replyParentId: string,
  token: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) =>
  requestGraphQL<{ createPost: { post: { id: string } } }>(
    `mutation CreateReply($input: CreatePostInput!) {
      createPost(input: $input) { post { id } }
    }`,
    {
      input: {
        bodyText: 'reply',
        replyParentId: encodeGlobalId('Post', replyParentId),
        visibility,
      },
    },
    token,
  );

const requestReplyDescendants = (postId: string, token?: string) =>
  requestGraphQL<{
    node: {
      replyDescendants: { edges: Array<{ node: { id: string } }> };
    } | null;
  }>(
    `query LocalReplyThread($postId: ID!) {
      node(id: $postId) {
        ... on Post {
          replyDescendants(first: 10) { edges { node { id } } }
        }
      }
    }`,
    { postId: encodeGlobalId('Post', postId) },
    token,
  );

const loadNodes = async (ids: string[], token: string) => {
  const result = await requestGraphQL<{ nodes: Array<{ id: string } | null> }>(
    `query NotificationVisibility($ids: [ID!]!) {
      nodes(ids: $ids) { ... on Notification { id } }
    }`,
    { ids },
    token,
  );
  assertNoGraphQLErrors(result);
  return result.data!.nodes;
};

const loadNotificationConnection = (
  id: string,
  token: string | undefined,
  variables: { after?: string | null; first: number },
) =>
  requestGraphQL<{ node: { notifications: NotificationConnection } | null }>(
    `query ProfileNotifications($id: ID!, $first: Int!, $after: String) {
      node(id: $id) {
        ... on Profile {
          notifications(first: $first, after: $after) {
            edges {
              cursor
              node {
                __typename
                id
                readAt
                ... on FollowNotification { profile { id } }
                ... on ReactionNotification { type profile { id } post { id } }
                ... on RepostNotification { profile { id } post { id } }
                ... on ReplyNotification { profile { id } post { id } }
              }
            }
            pageInfo { endCursor hasNextPage }
          }
        }
      }
    }`,
    { id, ...variables },
    token,
  );

const markNotificationRead = (ids: string[], token?: string) =>
  requestGraphQL<{
    markNotificationRead: {
      notifications: NotificationNode[];
      recipientProfiles: Array<{ id: string; unreadNotificationCount: number }>;
    };
  }>(
    `mutation MarkNotificationRead($ids: [ID!]!) {
      markNotificationRead(input: { ids: $ids }) {
        notifications {
          id
          readAt
          ... on FollowNotification { profile { id } }
          ... on FollowRequestNotification { profile { id } followRequest { id } }
          ... on ReactionNotification { type profile { id } post { id } }
          ... on RepostNotification { profile { id } post { id } }
          ... on ReplyNotification { profile { id } post { id } }
        }
        recipientProfiles { id unreadNotificationCount }
      }
    }`,
    { ids },
    token,
  );

const loadUnreadNotificationCounts = (ids: string[], token?: string) =>
  requestGraphQL<{
    nodes: Array<{ id: string; unreadNotificationCount: number } | null>;
  }>(
    `query NotificationUnreadCounts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Profile { id unreadNotificationCount }
      }
    }`,
    { ids },
    token,
  );

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const notificationReadAt = (id: string) =>
  db
    .select({ readAt: Notifications.readAt })
    .from(Notifications)
    .where(eq(Notifications.id, id))
    .then(firstOrThrow)
    .then(({ readAt }) => readAt);

const createProfile = (name: string) => {
  const handle = `${name}-${crypto.randomUUID().slice(0, 8)}`;

  return db
    .insert(Profiles)
    .values({
      displayName: name,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
};

const addMembership = (accountId: string, profileId: string, role: AccountProfileRole) =>
  db.insert(AccountProfiles).values({ accountId, profileId, role });

const createFollow = (followeeProfileId: string, followerProfileId: string) =>
  db
    .insert(ProfileFollows)
    .values({ followeeProfileId, followerProfileId })
    .returning()
    .then(firstOrThrow);

const createFollowNotification = async (
  recipientProfileId: string,
  relatedProfileId: string,
  id?: string,
) => {
  const source = await createFollow(recipientProfileId, relatedProfileId);
  return db
    .insert(Notifications)
    .values({ id, kind: NotificationKind.FOLLOW, recipientProfileId, sourceId: source.id })
    .returning()
    .then(firstOrThrow);
};

const createReactionNotification = async (
  recipientProfileId: string,
  authorProfileId: string,
  type: string,
  id?: string,
) => {
  const post = await db
    .insert(Posts)
    .values({
      profileId: recipientProfileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const reaction = await db
    .insert(Reactions)
    .values({ postId: post.id, profileId: authorProfileId, type })
    .returning()
    .then(firstOrThrow);
  const notification = await db
    .insert(Notifications)
    .values({
      id,
      kind: NotificationKind.REACTION,
      recipientProfileId,
      sourceId: reaction.id,
    })
    .returning()
    .then(firstOrThrow);

  return { notification, post, reaction };
};

const createContentPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText(crypto.randomUUID()),
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createRepostNotification = async (
  recipientProfileId: string,
  authorProfileId: string,
  id?: string,
) => {
  const post = await createContentPost(recipientProfileId);
  const repost = await db
    .insert(Posts)
    .values({
      profileId: authorProfileId,
      repostSourceId: post.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.UNLISTED,
    })
    .returning()
    .then(firstOrThrow);
  const notification = await db
    .insert(Notifications)
    .values({
      id,
      kind: NotificationKind.REPOST,
      recipientProfileId,
      sourceId: repost.id,
    })
    .returning()
    .then(firstOrThrow);

  return { notification, post, repost };
};

const createAuthenticatedSession = async () => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile('viewer');
  await addMembership(account.id, profile.id, AccountProfileRole.OWNER);
  const token = `token-${crypto.randomUUID()}`;
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile.id,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);

  return { account, profile, session, token };
};

const resetFixtures = async () => {
  await db.delete(Notifications);
  await db.delete(Sessions);
  await db.delete(ProfileFollows);
  await db.delete(Reactions);
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db
    .delete(Instances)
    .where(and(eq(Instances.kind, InstanceKind.LOCAL), ne(Instances.id, localInstanceId)));
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
