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
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';
import type { encodeGlobalId as EncodeGlobalId } from '../../../src/graphql/global-id';

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
    ({ encodeGlobalId } = await import('../../../src/graphql/global-id'));

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

  test('resolves FOLLOW rows through Node and preserves nodes input order', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('recipient');
    const relatedProfiles = await Promise.all([createProfile('first'), createProfile('second')]);
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.ADMIN);
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

    const read = await markNotificationRead(reactionId, auth.token);
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.notification.id, reactionId);
    assert.equal(read.data?.markNotificationRead.recipientProfile.unreadNotificationCount, 1);
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

    const read = await markNotificationRead(repostId, auth.token);
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.notification.id, repostId);
    assert.equal(
      read.data?.markNotificationRead.notification.profile.id,
      encodeGlobalId('Profile', author.id),
    );
    assert.equal(
      read.data?.markNotificationRead.notification.post?.id,
      encodeGlobalId('Post', repost.post.id),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfile.unreadNotificationCount, 2);
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
      encodeGlobalId('FollowNotification', read.id),
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
      const result = await markNotificationRead(id, auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
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
      const result = await markNotificationRead(id, auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
    assert.deepEqual(
      await Promise.all(notifications.map(({ id }) => notificationReadAt(id))),
      notifications.map(() => null),
    );
  });

  test('marks a visible Notification Read once without depending on the selected Profile', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('read-recipient');
    const related = await createProfile('read-related');
    const otherRelated = await createProfile('other-unread-related');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.ADMIN);
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
    const first = await markNotificationRead(id, auth.token);
    assertNoGraphQLErrors(first);
    assert.equal(first.data?.markNotificationRead.notification.id, id);
    assert.equal(
      first.data?.markNotificationRead.notification.profile.id,
      encodeGlobalId('Profile', related.id),
    );
    assert.equal(
      first.data?.markNotificationRead.recipientProfile.id,
      encodeGlobalId('Profile', recipient.id),
    );
    assert.ok(first.data?.markNotificationRead.notification.readAt);
    assert.equal(first.data?.markNotificationRead.recipientProfile.unreadNotificationCount, 1);

    const repeated = await markNotificationRead(id, auth.token);
    assertNoGraphQLErrors(repeated);
    assert.equal(
      repeated.data?.markNotificationRead.notification.readAt,
      first.data?.markNotificationRead.notification.readAt,
    );
    assert.equal(repeated.data?.markNotificationRead.recipientProfile.unreadNotificationCount, 1);
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
      markNotificationRead(id, auth.token),
      markNotificationRead(id, auth.token),
    ]);
    results.forEach(assertNoGraphQLErrors);
    const readAt = results.map((result) => result.data?.markNotificationRead.notification.readAt);
    assert.ok(readAt[0]);
    assert.equal(readAt[1], readAt[0]);
    assert.deepEqual(
      results.map(
        (result) => result.data?.markNotificationRead.recipientProfile.unreadNotificationCount,
      ),
      [0, 0],
    );
  });

  test('returns PERMISSION_DENIED for an unauthenticated Read', async () => {
    const recipient = await createProfile('unauthenticated-recipient');
    const related = await createProfile('unauthenticated-related');
    const notification = await createFollowNotification(recipient.id, related.id);

    const result = await markNotificationRead(
      encodeGlobalId('FollowNotification', notification.id),
    );
    assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(await notificationReadAt(notification.id), null);
  });

  test('normalizes missing, unauthorized and hidden Notification Reads to NOT_FOUND', async () => {
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

    const unavailable = [unauthorized, inactive, missingSource, mismatch, hidden];
    const ids = [crypto.randomUUID(), ...unavailable.map(({ id }) => id)].map((id) =>
      encodeGlobalId('FollowNotification', id),
    );
    for (const id of ids) {
      const result = await markNotificationRead(id, auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
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

const markNotificationRead = (id: string, token?: string) =>
  requestGraphQL<{
    markNotificationRead: {
      notification: NotificationNode;
      recipientProfile: { id: string; unreadNotificationCount: number };
    };
  }>(
    `mutation MarkNotificationRead($id: ID!) {
      markNotificationRead(input: { id: $id }) {
        notification {
          id
          readAt
          ... on FollowNotification { profile { id } }
          ... on ReactionNotification { type profile { id } post { id } }
          ... on RepostNotification { profile { id } post { id } }
        }
        recipientProfile { id unreadNotificationCount }
      }
    }`,
    { id },
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
