import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  NotificationKind,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  executeProfileFollowPairTransition,
  profileFollowPairWorkflowId,
} from '@kosmo/core/temporal/follow-command';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { waitForProfileFollowWorkflows } from './temporal-test-helpers';
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
let PostMentions: typeof CoreDb.PostMentions;
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
      PostMentions,
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
    const firstRelatedProfileId = relatedProfileIds[0]!;
    const mixedIds = [notificationIds[1]!, profileId, notificationIds[0]!];

    const result = await requestGraphQL<{
      node: NotificationNode | null;
      nodes: Array<NotificationNode | ProfileNode | null>;
      sourceProfile: { id: string } | null;
    }>(
      `query NotificationNodes($id: ID!, $ids: [ID!]!, $sourceProfileId: ID!) {
        node(id: $id) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on FollowNotification { profile { id } }
        }
        sourceProfile: node(id: $sourceProfileId) { ... on Profile { id } }
        nodes(ids: $ids) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on FollowNotification { profile { id } }
          ... on Profile { id }
        }
      }`,
      { id: notificationIds[0]!, ids: mixedIds, sourceProfileId: firstRelatedProfileId },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.__typename, 'FollowNotification');
    assert.equal(result.data?.node?.id, notificationIds[0]);
    assert.equal(result.data?.node?.profile?.id, relatedProfileIds[0]);
    assert.equal(result.data?.node?.profile?.id, result.data?.sourceProfile?.id);
    assert.deepEqual(
      result.data?.nodes.map((node) => [node?.__typename, node?.id]),
      [
        ['FollowNotification', notificationIds[1]],
        ['Profile', profileId],
        ['FollowNotification', notificationIds[0]],
      ],
    );
    assert.equal((result.data?.nodes[0] as NotificationNode).profile?.id, relatedProfileIds[1]);
    assert.equal((result.data?.nodes[2] as NotificationNode).profile?.id, relatedProfileIds[0]);
  });

  test('keeps a Follow Notification when its private source is unavailable to the selected Profile', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('private-follow-notification-recipient');
    const follower = await createProfile('private-follow-notification-follower');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    assert.notEqual(auth.profile.id, recipient.id);
    assert.notEqual(auth.profile.id, follower.id);
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(inArray(Profiles.id, [recipient.id, follower.id]));

    const follow = await createFollow(recipient.id, follower.id);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: follow.id,
      })
      .returning()
      .then(firstOrThrow);
    const notificationId = encodeGlobalId('FollowNotification', notification.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const sourceId = encodeGlobalId('ProfileFollow', follow.id);
    const followerId = encodeGlobalId('Profile', follower.id);

    const boundary = await requestGraphQL<{
      notification: { id: string; profile: { id: string } | null } | null;
      source: { id: string; follower: { id: string } | null } | null;
      follower: { id: string } | null;
    }>(
      `query PrivateFollowNotification($notificationId: ID!, $sourceId: ID!, $followerId: ID!) {
        notification: node(id: $notificationId) {
          ... on FollowNotification { id profile { id } }
        }
        source: node(id: $sourceId) { ... on ProfileFollow { id follower { id } } }
        follower: node(id: $followerId) { ... on Profile { id } }
      }`,
      { notificationId, sourceId, followerId },
      auth.token,
    );
    assertNoGraphQLErrors(boundary);
    assert.deepEqual(boundary.data?.notification, {
      id: notificationId,
      profile: { id: followerId },
    });
    assert.equal(boundary.data?.source, null);
    assert.deepEqual(boundary.data?.follower, { id: followerId });

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => ({
        id: node.id,
        profile: node.profile,
      })),
      [{ id: notificationId, profile: { id: followerId } }],
    );
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 1);

    const read = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id, profile }) => ({ id, profile })),
      [{ id: notificationId, profile: { id: followerId } }],
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(await notificationReadAt(notification.id));
  });

  test('keeps Notification kinds bound to their matching GraphQL type and recipient scope', async () => {
    const auth = await createAuthenticatedSession();
    const related = await createProfile('cross-kind-recipient-related');
    const profileNotification = await createFollowNotification(auth.profile.id, related.id);
    const operationalNotification = await createOperationalNotification(auth.account.id, {
      href: '/maintenance',
      title: 'Maintenance',
    });
    const accountScopedFollow = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: null,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);
    const profileScopedOperational = await db
      .insert(Notifications)
      .values({
        data: { href: '/maintenance', title: 'Maintenance' },
        kind: NotificationKind.OPERATIONAL,
        recipientAccountId: auth.account.id,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const profileNotificationId = encodeGlobalId('FollowNotification', profileNotification.id);
    const operationalNotificationId = encodeGlobalId(
      'OperationalNotification',
      operationalNotification.id,
    );
    const nodeResults = await requestGraphQL<{
      nodes: Array<{ __typename: string; id: string } | null>;
    }>(
      `query CrossKindNotificationNodes($ids: [ID!]!) {
        nodes(ids: $ids) { ... on Notification { __typename id } }
      }`,
      {
        ids: [
          profileNotificationId,
          encodeGlobalId('OperationalNotification', profileNotification.id),
          operationalNotificationId,
          encodeGlobalId('FollowNotification', operationalNotification.id),
          encodeGlobalId('FollowNotification', accountScopedFollow.id),
          encodeGlobalId('OperationalNotification', profileScopedOperational.id),
        ],
      },
      auth.token,
    );
    assertNoGraphQLErrors(nodeResults);
    assert.deepEqual(
      nodeResults.data?.nodes.map((node) => node && [node.__typename, node.id]),
      [
        ['FollowNotification', profileNotificationId],
        null,
        ['OperationalNotification', operationalNotificationId],
        null,
        null,
        null,
      ],
    );

    const profileId = encodeGlobalId('Profile', auth.profile.id);
    const connection = await loadNotificationConnection(profileId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      new Set(connection.data?.node?.notifications.edges.map(({ node }) => node.id)),
      new Set([profileNotificationId, operationalNotificationId]),
    );
    const counts = await loadUnreadNotificationCounts([profileId], auth.token);
    assertNoGraphQLErrors(counts);
    assert.equal(counts.data?.nodes[0]?.unreadNotificationCount, 2);

    const read = await markNotificationRead(
      [
        profileNotificationId,
        encodeGlobalId('OperationalNotification', profileNotification.id),
        operationalNotificationId,
        encodeGlobalId('FollowNotification', operationalNotification.id),
        encodeGlobalId('FollowNotification', accountScopedFollow.id),
        encodeGlobalId('OperationalNotification', profileScopedOperational.id),
      ],
      auth.token,
    );
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      new Set(read.data?.markNotificationRead.notifications.map(({ id }) => id)),
      new Set([profileNotificationId, operationalNotificationId]),
    );
    assert.ok(await notificationReadAt(profileNotification.id));
    assert.ok(await notificationReadAt(operationalNotification.id));
    assert.equal(await notificationReadAt(accountScopedFollow.id), null);
    assert.equal(await notificationReadAt(profileScopedOperational.id), null);
  });

  test('combines Profile and Account Operational Notifications in the Profile feed', async () => {
    const auth = await createAuthenticatedSession();
    const otherProfile = await createProfile('operational-feed-other-profile');
    await addMembership(auth.account.id, otherProfile.id, AccountProfileRole.OWNER);
    const disabledProfile = await createProfile('operational-feed-disabled-profile');
    await addMembership(auth.account.id, disabledProfile.id, AccountProfileRole.OWNER);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, disabledProfile.id));
    const related = await createProfile('operational-feed-related');
    const profileNotification = await createFollowNotification(auth.profile.id, related.id);
    const operationalNotification = await createOperationalNotification(auth.account.id, {
      body: 'Scheduled maintenance begins tonight.',
      href: '/maintenance',
      title: 'Service notice',
    });
    const profileNotificationId = encodeGlobalId('FollowNotification', profileNotification.id);
    const operationalNotificationId = encodeGlobalId(
      'OperationalNotification',
      operationalNotification.id,
    );
    const profileId = encodeGlobalId('Profile', auth.profile.id);
    const otherProfileId = encodeGlobalId('Profile', otherProfile.id);
    const result = await requestGraphQL<{
      node: {
        body: string | null;
        href: string;
        id: string;
        title: string;
      } | null;
      otherProfile: {
        notifications: { edges: Array<{ node: { __typename: string; id: string } }> };
        unreadNotificationCount: number;
      } | null;
      profile: {
        notifications: { edges: Array<{ node: { __typename: string; id: string } }> };
        unreadNotificationCount: number;
      } | null;
    }>(
      `query OperationalNotifications($notificationId: ID!, $profileId: ID!, $otherProfileId: ID!) {
        node(id: $notificationId) {
          ... on OperationalNotification { id title body href }
        }
        profile: node(id: $profileId) {
          ... on Profile {
            unreadNotificationCount
            notifications(first: 10) { edges { node { __typename id } } }
          }
        }
        otherProfile: node(id: $otherProfileId) {
          ... on Profile {
            unreadNotificationCount
            notifications(first: 10) { edges { node { __typename id } } }
          }
        }
      }`,
      { notificationId: operationalNotificationId, profileId, otherProfileId },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      body: 'Scheduled maintenance begins tonight.',
      href: '/maintenance',
      id: operationalNotificationId,
      title: 'Service notice',
    });
    assert.equal(result.data?.profile?.unreadNotificationCount, 2);
    assert.deepEqual(
      new Set(
        result.data?.profile?.notifications.edges.map(({ node }) => [node.__typename, node.id]),
      ),
      new Set([
        ['OperationalNotification', operationalNotificationId],
        ['FollowNotification', profileNotificationId],
      ]),
    );
    assert.equal(result.data?.otherProfile?.unreadNotificationCount, 1);
    assert.deepEqual(
      result.data?.otherProfile?.notifications.edges.map(({ node }) => [node.__typename, node.id]),
      [['OperationalNotification', operationalNotificationId]],
    );

    const other = await createAuthenticatedSession();
    assert.deepEqual(await loadNodes([operationalNotificationId], other.token), [null]);
    const otherAccountNotification = await createOperationalNotification(other.account.id, {
      body: 'A notice for another account.',
      href: '/other-account',
      title: 'Other account notice',
    });
    const otherAccountNotificationId = encodeGlobalId(
      'OperationalNotification',
      otherAccountNotification.id,
    );

    const read = await requestGraphQL<{
      markNotificationRead: {
        notifications: Array<{ id: string; readAt: string | null; __typename: string }>;
        recipientProfiles: Array<{ id: string; unreadNotificationCount: number }>;
      };
    }>(
      `mutation MarkOperationalAndProfileNotifications($ids: [ID!]!) {
        markNotificationRead(input: { ids: $ids }) {
          notifications { __typename id readAt }
          recipientProfiles { id unreadNotificationCount }
        }
      }`,
      { ids: [operationalNotificationId, profileNotificationId, otherAccountNotificationId] },
      auth.token,
    );
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      new Set(read.data?.markNotificationRead.notifications.map(({ id }) => id)),
      new Set([operationalNotificationId, profileNotificationId]),
    );
    const recipientProfiles = read.data?.markNotificationRead.recipientProfiles ?? [];
    assert.deepEqual(
      new Set(recipientProfiles.map(({ id }) => id)),
      new Set([profileId, otherProfileId]),
    );
    assert.equal(recipientProfiles.length, 2);
    assert.ok(
      recipientProfiles.every(({ unreadNotificationCount }) => unreadNotificationCount === 0),
    );
    const originalReadAts = await Promise.all([
      notificationReadAt(operationalNotification.id),
      notificationReadAt(profileNotification.id),
    ]);
    assert.ok(originalReadAts.every(Boolean));
    assert.equal(await notificationReadAt(otherAccountNotification.id), null);
    const firstReadAts = new Map(
      read.data?.markNotificationRead.notifications.map(({ id, readAt }) => [id, readAt]),
    );
    assert.ok([...firstReadAts.values()].every(Boolean));

    const repeated = await requestGraphQL<{
      markNotificationRead: { notifications: Array<{ id: string; readAt: string | null }> };
    }>(
      `mutation RepeatOperationalNotificationRead($ids: [ID!]!) {
        markNotificationRead(input: { ids: $ids }) { notifications { id readAt } }
      }`,
      { ids: [operationalNotificationId, profileNotificationId] },
      auth.token,
    );
    assertNoGraphQLErrors(repeated);
    assert.deepEqual(
      new Map(
        repeated.data?.markNotificationRead.notifications.map(({ id, readAt }) => [id, readAt]),
      ),
      firstReadAts,
    );
  });

  test('isolates notifications for the same Profile by recipient Account', async () => {
    const firstAuth = await createAuthenticatedSession();
    const secondAuth = await createAuthenticatedSession();
    const sharedProfile = await createProfile('shared-notification-recipient');
    const firstRelated = await createProfile('shared-notification-first-source');
    const secondRelated = await createProfile('shared-notification-second-source');
    await addMembership(firstAuth.account.id, sharedProfile.id, AccountProfileRole.MEMBER);
    await addMembership(secondAuth.account.id, sharedProfile.id, AccountProfileRole.OWNER);

    const firstNotification = await createFollowNotification(
      sharedProfile.id,
      firstRelated.id,
      undefined,
      firstAuth.account.id,
    );
    const secondNotification = await createFollowNotification(
      sharedProfile.id,
      secondRelated.id,
      undefined,
      secondAuth.account.id,
    );
    const firstId = encodeGlobalId('FollowNotification', firstNotification.id);
    const secondId = encodeGlobalId('FollowNotification', secondNotification.id);
    const sharedProfileId = encodeGlobalId('Profile', sharedProfile.id);

    assert.deepEqual(await loadNodes([firstId, secondId], firstAuth.token), [
      { id: firstId },
      null,
    ]);
    assert.deepEqual(await loadNodes([firstId, secondId], secondAuth.token), [
      null,
      { id: secondId },
    ]);

    const [firstFeed, secondFeed] = await Promise.all([
      loadNotificationConnection(sharedProfileId, firstAuth.token, { first: 10 }),
      loadNotificationConnection(sharedProfileId, secondAuth.token, { first: 10 }),
    ]);
    assertNoGraphQLErrors(firstFeed);
    assertNoGraphQLErrors(secondFeed);
    assert.deepEqual(
      firstFeed.data?.node?.notifications.edges.map(({ node }) => node.id),
      [firstId],
    );
    assert.deepEqual(
      secondFeed.data?.node?.notifications.edges.map(({ node }) => node.id),
      [secondId],
    );

    const [firstCount, secondCount] = await Promise.all([
      loadUnreadNotificationCounts([sharedProfileId], firstAuth.token),
      loadUnreadNotificationCounts([sharedProfileId], secondAuth.token),
    ]);
    assertNoGraphQLErrors(firstCount);
    assertNoGraphQLErrors(secondCount);
    assert.equal(firstCount.data?.nodes[0]?.unreadNotificationCount, 1);
    assert.equal(secondCount.data?.nodes[0]?.unreadNotificationCount, 1);

    const firstRead = await markNotificationRead([firstId, secondId], firstAuth.token);
    assertNoGraphQLErrors(firstRead);
    assert.deepEqual(
      firstRead.data?.markNotificationRead.notifications.map(({ id }) => id),
      [firstId],
    );
    assert.ok(await notificationReadAt(firstNotification.id));
    assert.equal(await notificationReadAt(secondNotification.id), null);

    const secondRead = await markNotificationRead([firstId, secondId], secondAuth.token);
    assertNoGraphQLErrors(secondRead);
    assert.deepEqual(
      secondRead.data?.markNotificationRead.notifications.map(({ id }) => id),
      [secondId],
    );
    assert.ok(await notificationReadAt(secondNotification.id));
  });

  test('keeps Profile-targeted notifications and read state independent within one Account', async () => {
    const auth = await createAuthenticatedSession();
    const secondRecipient = await createProfile('independent-notification-recipient');
    const firstRelated = await createProfile('independent-notification-first-source');
    const secondRelated = await createProfile('independent-notification-second-source');
    await addMembership(auth.account.id, secondRecipient.id, AccountProfileRole.MEMBER);

    const firstNotification = await createFollowNotification(
      auth.profile.id,
      firstRelated.id,
      undefined,
      auth.account.id,
    );
    const secondNotification = await createFollowNotification(
      secondRecipient.id,
      secondRelated.id,
      undefined,
      auth.account.id,
    );
    const firstId = encodeGlobalId('FollowNotification', firstNotification.id);
    const firstRecipientId = encodeGlobalId('Profile', auth.profile.id);
    const secondRecipientId = encodeGlobalId('Profile', secondRecipient.id);
    assert.notEqual(firstNotification.id, secondNotification.id);

    const firstRead = await markNotificationRead([firstId], auth.token);
    assertNoGraphQLErrors(firstRead);
    assert.deepEqual(
      firstRead.data?.markNotificationRead.notifications.map(({ id }) => id),
      [firstId],
    );
    assert.deepEqual(
      firstRead.data?.markNotificationRead.recipientProfiles.map(({ id }) => id),
      [firstRecipientId],
    );
    assert.ok(await notificationReadAt(firstNotification.id));
    assert.equal(await notificationReadAt(secondNotification.id), null);

    const counts = await loadUnreadNotificationCounts(
      [firstRecipientId, secondRecipientId],
      auth.token,
    );
    assertNoGraphQLErrors(counts);
    assert.deepEqual(
      counts.data?.nodes.map((profile) => profile?.unreadNotificationCount),
      [0, 1],
    );
  });

  test('hides a Profile notification after membership leave and preserves it on rejoin', async () => {
    const auth = await createAuthenticatedSession();
    const related = await createProfile('membership-notification-source');
    const notification = await createFollowNotification(
      auth.profile.id,
      related.id,
      undefined,
      auth.account.id,
    );
    const notificationId = encodeGlobalId('FollowNotification', notification.id);
    const profileId = encodeGlobalId('Profile', auth.profile.id);

    const initialRead = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(initialRead);
    const originalReadAt = initialRead.data?.markNotificationRead.notifications[0]?.readAt;
    assert.ok(originalReadAt);

    await db
      .delete(AccountProfiles)
      .where(
        and(
          eq(AccountProfiles.accountId, auth.account.id),
          eq(AccountProfiles.profileId, auth.profile.id),
        ),
      );

    assert.deepEqual(await loadNodes([notificationId], auth.token), [null]);
    const hiddenRead = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(hiddenRead);
    assert.deepEqual(hiddenRead.data?.markNotificationRead, {
      notifications: [],
      recipientProfiles: [],
    });
    assert.equal(
      (await notificationReadAt(notification.id))?.toString({ smallestUnit: 'millisecond' }),
      originalReadAt,
    );

    await addMembership(auth.account.id, auth.profile.id, AccountProfileRole.OWNER);
    assert.deepEqual(await loadNodes([notificationId], auth.token), [{ id: notificationId }]);

    const restored = await loadNotificationConnection(profileId, auth.token, { first: 10 });
    assertNoGraphQLErrors(restored);
    assert.deepEqual(
      restored.data?.node?.notifications.edges.map(({ node }) => [node.id, node.readAt]),
      [[notificationId, originalReadAt]],
    );
    const count = await loadUnreadNotificationCounts([profileId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 0);
    assert.equal(
      (await notificationReadAt(notification.id))?.toString({ smallestUnit: 'millisecond' }),
      originalReadAt,
    );
  });

  test('paginates Notifications by createdAt and id and accepts only visible legacy ID cursors', async () => {
    const auth = await createAuthenticatedSession();
    const otherAuth = await createAuthenticatedSession();
    await addMembership(otherAuth.account.id, auth.profile.id, AccountProfileRole.MEMBER);

    const oldTimestamp = Temporal.Instant.from('2026-10-15T00:00:00Z');
    const newTimestamp = Temporal.Instant.from('2026-10-16T00:00:00Z');
    const olderLowId = '00000000-0000-8006-8000-000000000100';
    const olderHighId = '00000000-0000-8006-8000-000000000200';
    const newerLowId = '00000000-0000-8006-8000-000000000050';
    await db.insert(Notifications).values([
      {
        id: olderLowId,
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
        createdAt: oldTimestamp,
      },
      {
        id: olderHighId,
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
        createdAt: oldTimestamp,
      },
      {
        id: newerLowId,
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
        createdAt: newTimestamp,
      },
      {
        kind: NotificationKind.FOLLOW,
        recipientAccountId: otherAuth.account.id,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
      },
    ]);

    const profileId = encodeGlobalId('Profile', auth.profile.id);
    const firstPage = await loadNotificationConnection(profileId, auth.token, { first: 2 });
    assertNoGraphQLErrors(firstPage);
    const firstEdges = firstPage.data?.node?.notifications.edges ?? [];
    assert.deepEqual(
      firstEdges.map(({ node }) => node.id),
      [newerLowId, olderHighId].map((id) => encodeGlobalId('FollowNotification', id)),
    );
    assert.equal(firstPage.data?.node?.notifications.pageInfo.hasNextPage, true);

    const secondPage = await loadNotificationConnection(profileId, auth.token, {
      first: 2,
      after: firstEdges[1]?.cursor,
    });
    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('FollowNotification', olderLowId)],
    );
    assert.equal(secondPage.data?.node?.notifications.pageInfo.hasNextPage, false);

    const legacyCursorPage = await loadNotificationConnection(profileId, auth.token, {
      first: 2,
      after: olderHighId,
    });
    assertNoGraphQLErrors(legacyCursorPage);
    assert.deepEqual(
      legacyCursorPage.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('FollowNotification', olderLowId)],
    );

    for (const invalidCursor of [crypto.randomUUID(), '00000000-0000-8006-8000-000000000999']) {
      const result = await loadNotificationConnection(profileId, auth.token, {
        first: 2,
        after: invalidCursor,
      });
      assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
      assert.equal(result.data?.node, null);
    }

    const unauthorizedCursor = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientAccountId: otherAuth.account.id,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);
    const unauthorizedCursorResult = await loadNotificationConnection(profileId, auth.token, {
      first: 2,
      after: unauthorizedCursor.id,
    });
    assert.equal(unauthorizedCursorResult.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(unauthorizedCursorResult.data?.node, null);
  });

  test('keeps legacy profile-only Notifications visible to current Profile members', async () => {
    const auth = await createAuthenticatedSession();
    const member = await createAuthenticatedSession();
    await addMembership(member.account.id, auth.profile.id, AccountProfileRole.MEMBER);

    const older = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientAccountId: null,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
        createdAt: Temporal.Instant.from('2026-10-15T00:00:00Z'),
      })
      .returning()
      .then(firstOrThrow);
    const newer = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientAccountId: null,
        recipientProfileId: auth.profile.id,
        sourceId: crypto.randomUUID(),
        createdAt: Temporal.Instant.from('2026-10-16T00:00:00Z'),
      })
      .returning()
      .then(firstOrThrow);

    const profileId = encodeGlobalId('Profile', auth.profile.id);
    const notificationIds = [older, newer].map(({ id }) =>
      encodeGlobalId('FollowNotification', id),
    );
    assert.deepEqual(
      await loadNodes(notificationIds, member.token),
      notificationIds.map((id) => ({ id })),
    );

    const firstPage = await loadNotificationConnection(profileId, member.token, { first: 1 });
    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('FollowNotification', newer.id)],
    );
    assert.equal(firstPage.data?.node?.notifications.pageInfo.hasNextPage, true);

    const rawUuidCursorPage = await loadNotificationConnection(profileId, member.token, {
      first: 1,
      after: newer.id,
    });
    assertNoGraphQLErrors(rawUuidCursorPage);
    assert.deepEqual(
      rawUuidCursorPage.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('FollowNotification', older.id)],
    );

    const count = await loadUnreadNotificationCounts([profileId], member.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 2);

    const read = await markNotificationRead(
      [encodeGlobalId('FollowNotification', older.id)],
      member.token,
    );
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id),
      [encodeGlobalId('FollowNotification', older.id)],
    );
    assert.ok(await notificationReadAt(older.id));

    const countAfterRead = await loadUnreadNotificationCounts([profileId], member.token);
    assertNoGraphQLErrors(countAfterRead);
    assert.equal(countAfterRead.data?.nodes[0]?.unreadNotificationCount, 1);
  });

  test('ACTIVE Account without Profiles can read its own Operational Notifications', async () => {
    const suffix = crypto.randomUUID();
    const token = `profileless-${suffix}`;
    const account = await db
      .insert(Accounts)
      .values({
        displayName: 'Profileless Account',
        oidcSubject: `subject-${suffix}`,
        state: AccountState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .insert(Sessions)
      .values({ accountId: account.id, state: SessionState.ACTIVE, token })
      .returning()
      .then(firstOrThrow);
    const notification = await createOperationalNotification(account.id, {
      href: '/profileless-notice',
      title: 'Account notice',
    });
    const notificationId = encodeGlobalId('OperationalNotification', notification.id);
    const accountId = encodeGlobalId('Account', account.id);

    const result = await requestGraphQL<{
      currentSession: {
        account: { id: string };
        selectedProfile: null;
      } | null;
      me: { id: string } | null;
      node: { href: string; id: string; title: string } | null;
    }>(
      `query ProfilelessAccountNotifications($notificationId: ID!) {
        node(id: $notificationId) {
          ... on OperationalNotification { id title href }
        }
        currentSession {
          account { id }
          selectedProfile { id }
        }
        me { id }
      }`,
      { notificationId },
      token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      node: { href: '/profileless-notice', id: notificationId, title: 'Account notice' },
      currentSession: {
        account: { id: accountId },
        selectedProfile: null,
      },
      me: { id: accountId },
    });

    const read = await requestGraphQL<{
      markNotificationRead: {
        notifications: Array<{ id: string }>;
        recipientProfiles: Array<{ id: string; unreadNotificationCount: number }>;
      };
    }>(
      `mutation ReadProfilelessAccountNotification($id: ID!) {
        markNotificationRead(input: { ids: [$id] }) {
          notifications { id }
          recipientProfiles { id unreadNotificationCount }
        }
      }`,
      { id: notificationId },
      token,
    );
    assertNoGraphQLErrors(read);
    assert.deepEqual(read.data?.markNotificationRead, {
      notifications: [{ id: notificationId }],
      recipientProfiles: [],
    });
    assert.ok(await notificationReadAt(notification.id));
  });

  test('keeps Account Operational Notifications in each Profile feed across cursor pages', async () => {
    const auth = await createAuthenticatedSession();
    const otherAccount = await createAuthenticatedSession();
    const otherProfile = await createProfile('operational-feed-other-profile');
    await addMembership(auth.account.id, otherProfile.id, AccountProfileRole.OWNER);

    const relatedProfiles = await Promise.all([
      createProfile('operational-feed-first-related'),
      createProfile('operational-feed-second-related'),
    ]);
    const profileNotifications = await Promise.all([
      createFollowNotification(auth.profile.id, relatedProfiles[0]!.id),
      createFollowNotification(otherProfile.id, relatedProfiles[1]!.id),
    ]);
    const operationalNotification = await createOperationalNotification(auth.account.id, {
      href: '/operational-feed',
      title: 'Account notice',
    });
    const otherOperationalNotification = await createOperationalNotification(
      otherAccount.account.id,
      {
        href: '/other-account-notice',
        title: 'Other Account notice',
      },
    );
    const profileNotificationIds = profileNotifications.map(({ id }) =>
      encodeGlobalId('FollowNotification', id),
    );
    const operationalNotificationId = encodeGlobalId(
      'OperationalNotification',
      operationalNotification.id,
    );
    const otherOperationalNotificationId = encodeGlobalId(
      'OperationalNotification',
      otherOperationalNotification.id,
    );
    const selectedProfileIds = [auth.profile.id, otherProfile.id].map((id) =>
      encodeGlobalId('Profile', id),
    );

    const read = await requestGraphQL<{
      markNotificationRead: { notifications: Array<{ id: string; readAt: string | null }> };
    }>(
      `mutation ReadOperationalNotification($ids: [ID!]!) {
        markNotificationRead(input: { ids: $ids }) { notifications { id readAt } }
      }`,
      { ids: [operationalNotificationId] },
      auth.token,
    );
    assertNoGraphQLErrors(read);
    const operationalReadAt = read.data?.markNotificationRead.notifications[0]?.readAt;
    assert.ok(operationalReadAt);

    const loadProfilePage = (after: string | null) =>
      requestGraphQL<{
        currentSession: {
          selectedProfile: {
            id: string;
            notifications: {
              edges: Array<{ cursor: string; node: { id: string; readAt: string | null } }>;
              pageInfo: { hasNextPage: boolean };
            };
            unreadNotificationCount: number | null;
          } | null;
        };
      }>(
        `query CurrentProfileNotifications($after: String) {
          currentSession {
            selectedProfile {
              id
              unreadNotificationCount
              notifications(first: 1, after: $after) {
                edges { cursor node { id readAt } }
                pageInfo { hasNextPage }
              }
            }
          }
        }`,
        { after },
        auth.token,
      );

    const loadTwoPages = async () => {
      const firstPage = await loadProfilePage(null);
      assertNoGraphQLErrors(firstPage);
      const firstSession = firstPage.data?.currentSession;
      assert.ok(firstSession);
      const firstProfile = firstSession.selectedProfile;
      assert.ok(firstProfile);
      const firstEdge = firstProfile.notifications.edges[0];
      assert.ok(firstEdge);
      assert.equal(firstProfile.notifications.pageInfo.hasNextPage, true);

      const secondPage = await loadProfilePage(firstEdge.cursor);
      assertNoGraphQLErrors(secondPage);
      const secondSession = secondPage.data?.currentSession;
      assert.ok(secondSession);
      const secondProfile = secondSession.selectedProfile;
      assert.ok(secondProfile);
      assert.equal(secondProfile.notifications.pageInfo.hasNextPage, false);

      return {
        edges: [...firstProfile.notifications.edges, ...secondProfile.notifications.edges],
        profile: firstProfile,
      };
    };

    const initial = await loadTwoPages();
    assert.equal(initial.profile.id, selectedProfileIds[0]);
    assert.equal(initial.profile.unreadNotificationCount, 1);
    assert.deepEqual(
      new Set(initial.edges.map(({ node }) => node.id)),
      new Set([profileNotificationIds[0], operationalNotificationId]),
    );
    assert.equal(initial.edges.length, new Set(initial.edges.map(({ node }) => node.id)).size);
    assert.equal(
      initial.edges.some(({ node }) => node.id === otherOperationalNotificationId),
      false,
    );

    const switchProfile = await requestGraphQL<{ selectProfile: { profile: { id: string } } }>(
      `mutation SelectProfile($id: ID!) { selectProfile(input: { id: $id }) { profile { id } } }`,
      { id: selectedProfileIds[1] },
      auth.token,
    );
    assertNoGraphQLErrors(switchProfile);
    assert.equal(switchProfile.data?.selectProfile.profile.id, selectedProfileIds[1]);

    const switched = await loadTwoPages();
    assert.equal(switched.profile.id, selectedProfileIds[1]);
    assert.equal(switched.profile.unreadNotificationCount, 1);
    assert.deepEqual(
      new Set(switched.edges.map(({ node }) => node.id)),
      new Set([profileNotificationIds[1], operationalNotificationId]),
    );
    assert.equal(switched.edges.length, new Set(switched.edges.map(({ node }) => node.id)).size);
    assert.equal(
      switched.edges.some(({ node }) => node.id === otherOperationalNotificationId),
      false,
    );
    assert.equal(
      switched.edges.find(({ node }) => node.id === operationalNotificationId)?.node.readAt,
      operationalReadAt,
    );
  });

  test('Suspended Accounts and guests cannot access Operational Notifications', async () => {
    const auth = await createAuthenticatedSession(AccountState.SUSPENDED);
    const profileId = encodeGlobalId('Profile', auth.profile.id);
    const operationalNotification = await createOperationalNotification(auth.account.id, {
      href: 'https://status.example.com/incident',
      title: 'Service status update',
    });
    const operationalNotificationId = encodeGlobalId(
      'OperationalNotification',
      operationalNotification.id,
    );

    const query = `query OperationalNotificationAccess($notificationId: ID!) {
      operationalNotification: node(id: $notificationId) {
        ... on OperationalNotification { id }
      }
    }`;
    const [suspended, anonymous] = await Promise.all([
      requestGraphQL<{ operationalNotification: null }>(
        query,
        { notificationId: operationalNotificationId },
        auth.token,
      ),
      requestGraphQL<{ operationalNotification: null }>(query, {
        notificationId: operationalNotificationId,
      }),
    ]);
    assert.deepEqual(suspended, { data: { operationalNotification: null } });
    assert.deepEqual(anonymous, { data: { operationalNotification: null } });

    const profileFeed = `query ProfileNotificationAccess($profileId: ID!) {
      profile: node(id: $profileId) {
        ... on Profile {
          unreadNotificationCount
          notifications(first: 1) { edges { node { id } } }
        }
      }
    }`;
    const [suspendedFeed, anonymousFeed] = await Promise.all([
      requestGraphQL<unknown>(profileFeed, { profileId }, auth.token),
      requestGraphQL<unknown>(profileFeed, { profileId }),
    ]);
    assert.ok(
      suspendedFeed.errors?.some(({ extensions }) => extensions?.code === 'PERMISSION_DENIED'),
    );
    assert.ok(
      anonymousFeed.errors?.some(({ extensions }) => extensions?.code === 'PERMISSION_DENIED'),
    );

    const markRead = `mutation MarkOperationalNotificationRead($ids: [ID!]!) {
      markNotificationRead(input: { ids: $ids }) { notifications { id } }
    }`;
    const [read, anonymousRead] = await Promise.all([
      requestGraphQL<unknown>(markRead, { ids: [operationalNotificationId] }, auth.token),
      requestGraphQL<unknown>(markRead, { ids: [operationalNotificationId] }),
    ]);
    assert.equal(read.data, null);
    assert.equal(read.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(anonymousRead.data, null);
    assert.equal(anonymousRead.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    assert.equal(await notificationReadAt(operationalNotification.id), null);
  });

  test('resolves FOLLOW_REQUEST rows through Node, list, unread count and Read', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-recipient');
    const requester = await createProfile('follow-request-requester');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    await db
      .update(Sessions)
      .set({ activeProfileId: recipient.id })
      .where(eq(Sessions.id, auth.session.id));
    const request = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: requester.id })
      .returning()
      .then(firstOrThrow);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
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
      source: {
        id: string;
        follower: { id: string } | null;
        followee: { id: string } | null;
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
      `query FollowRequestNotification($notificationId: ID!, $profileId: ID!, $requestId: ID!) {
        node(id: $notificationId) {
          __typename
          ... on FollowRequestNotification { profile { id } followRequest { id } }
        }
        source: node(id: $requestId) {
          ... on ProfileFollowRequest { id follower { id } followee { id } }
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
      { notificationId, profileId: recipientId, requestId },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'FollowRequestNotification',
      followRequest: { id: requestId },
      profile: { id: requesterId },
    });
    assert.deepEqual(result.data?.source, {
      id: requestId,
      follower: { id: requesterId },
      followee: { id: recipientId },
    });
    assert.equal(result.data?.node?.followRequest.id, result.data?.source?.id);
    assert.equal(result.data?.node?.profile.id, result.data?.source?.follower?.id);
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

  test('resolves Follow Request Notification fields through ordinary source loaders', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-loader-recipient');
    const requester = await createProfile('follow-request-loader-requester');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    await db
      .update(Sessions)
      .set({ activeProfileId: recipient.id })
      .where(eq(Sessions.id, auth.session.id));
    const request = await db
      .insert(ProfileFollowRequests)
      .values({ followeeProfileId: recipient.id, followerProfileId: requester.id })
      .returning()
      .then(firstOrThrow);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
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
        source: {
          id: string;
          follower: { id: string } | null;
          followee: { id: string } | null;
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
        `query FollowRequestSourceLoader($notificationId: ID!, $profileId: ID!, $requestId: ID!) {
          node(id: $notificationId) {
            __typename
            ... on FollowRequestNotification { profile { id } followRequest { id } }
          }
          source: node(id: $requestId) {
            ... on ProfileFollowRequest { id follower { id } followee { id } }
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
        { notificationId, profileId: recipientId, requestId },
        auth.token,
      );

      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.node, {
        __typename: 'FollowRequestNotification',
        followRequest: { id: requestId },
        profile: { id: requesterId },
      });
      assert.deepEqual(result.data?.source, {
        id: requestId,
        follower: { id: requesterId },
        followee: { id: recipientId },
      });
      assert.equal(result.data?.node?.followRequest.id, result.data?.source?.id);
      assert.equal(result.data?.node?.profile.id, result.data?.source?.follower?.id);
      assert.deepEqual(result.data?.profile?.notifications.edges[0]?.node, {
        __typename: 'FollowRequestNotification',
        followRequest: { id: requestId },
        profile: { id: requesterId },
      });
    } finally {
      await db.delete(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, request.id));
    }
  });

  test('does not leave a stale row when a request is created and cancelled', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('follow-request-race-recipient');
    const requester = await createProfile('follow-request-race-requester');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.MEMBER);
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(eq(Profiles.id, recipient.id));

    const result = await executeProfileFollowPairTransition({
      pair: { followerProfileId: requester.id, followeeProfileId: recipient.id },
      command: {
        kind: 'FOLLOW',
        origin: 'LOCAL',
      },
    });
    if (result.result.commandKind !== 'FOLLOW' || result.result.kind !== 'PENDING') {
      assert.fail('Expected pending follow request');
    }

    const request = result.profileFollowRequest!;
    const cancelResult = await executeProfileFollowPairTransition({
      pair: { followerProfileId: requester.id, followeeProfileId: recipient.id },
      command: {
        kind: 'CANCEL',
        actorProfileId: requester.id,
        expectedRowId: request.id,
        origin: 'LOCAL',
      },
    });
    if (cancelResult.result.commandKind !== 'CANCEL') {
      assert.fail('Expected canceled follow request');
    }
    assert.equal(cancelResult.result.profileFollowRequestId, request.id);

    await temporalClient.workflow
      .getHandle(
        profileFollowPairWorkflowId({
          followerProfileId: requester.id,
          followeeProfileId: recipient.id,
        }),
      )
      .result();

    const notificationId = encodeGlobalId('FollowRequestNotification', request.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    assert.deepEqual(await loadNodes([notificationId], auth.token), [null]);
    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(connection.data?.node?.notifications.edges, []);
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 0);
  });

  test('keeps FOLLOW_REQUEST rows with unavailable sources in Node, connection, count and Read', async () => {
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
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
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
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
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
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
        recipientProfileId: recipient.id,
        sourceId: mismatchedRequest.id,
      })
      .returning()
      .then(firstOrThrow);

    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW_REQUEST,
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
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
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
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
      await loadNodes(ids, auth.token),
      ids.map((id) => ({ id })),
    );
    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    const connectionNodes = new Map(
      connection.data?.node?.notifications.edges.map(({ node }) => [node.id, node]) ?? [],
    );
    assert.deepEqual([...connectionNodes.keys()].sort(), [...ids].sort());
    assert.deepEqual(connectionNodes.get(ids[0]!)?.profile, {
      id: encodeGlobalId('Profile', visibleRequester.id),
    });
    assert.equal(connectionNodes.get(ids[0]!)?.followRequest, null);
    assert.equal(connectionNodes.get(ids[1]!)?.profile, null);
    assert.equal(connectionNodes.get(ids[1]!)?.followRequest, null);
    assert.deepEqual(connectionNodes.get(ids[2]!)?.profile, {
      id: encodeGlobalId('Profile', visibleRequester.id),
    });
    assert.equal(connectionNodes.get(ids[2]!)?.followRequest, null);
    for (const id of [ids[3]!, ids[4]!]) {
      assert.equal(connectionNodes.get(id)?.profile, null);
      assert.equal(connectionNodes.get(id)?.followRequest, null);
    }
    const sourceNode = await requestGraphQL<{
      notification: {
        followRequest: { id: string } | null;
        profile: { id: string } | null;
      } | null;
      requester: { id: string } | null;
      source: { id: string } | null;
    }>(
      `query UnselectedFollowRequestSource($notificationId: ID!, $sourceId: ID!, $requesterId: ID!) {
        notification: node(id: $notificationId) {
          ... on FollowRequestNotification { profile { id } followRequest { id } }
        }
        source: node(id: $sourceId) { ... on ProfileFollowRequest { id } }
        requester: node(id: $requesterId) { ... on Profile { id } }
      }`,
      {
        notificationId: ids[0],
        sourceId: encodeGlobalId('ProfileFollowRequest', visibleRequest.id),
        requesterId: encodeGlobalId('Profile', visibleRequester.id),
      },
      auth.token,
    );
    assertNoGraphQLErrors(sourceNode);
    assert.equal(sourceNode.data?.source, null);
    assert.deepEqual(sourceNode.data?.notification, {
      profile: { id: encodeGlobalId('Profile', visibleRequester.id) },
      followRequest: null,
    });
    assert.deepEqual(sourceNode.data?.requester, {
      id: encodeGlobalId('Profile', visibleRequester.id),
    });
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, ids.length);

    const missingSourceFields = await requestGraphQL<{
      nodes: Array<{
        followRequest: { id: string } | null;
        id: string;
        profile: { id: string } | null;
      } | null>;
    }>(
      `query MissingFollowRequestSource($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on FollowRequestNotification { id profile { id } followRequest { id } }
        }
      }`,
      { ids: [ids[3], ids[4]] },
      auth.token,
    );
    assertNoGraphQLErrors(missingSourceFields);
    assert.deepEqual(missingSourceFields.data?.nodes, [
      { id: ids[3], profile: null, followRequest: null },
      { id: ids[4], profile: null, followRequest: null },
    ]);

    const read = await markNotificationRead(ids, auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...ids].sort(),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(
      (
        await Promise.all(
          [
            visibleNotification,
            hiddenNotification,
            mismatchedNotification,
            missingSource,
            deletedNotification,
          ].map(({ id }) => notificationReadAt(id)),
        )
      ).every(Boolean),
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
          recipientAccountId: await notificationRecipientAccountId(recipient.id),
          recipientProfileId: recipient.id,
          sourceId: reply.id,
        });
        return { author, reply };
      }),
    );
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const postIds = replies.map(({ reply }) => encodeGlobalId('Post', reply.id));

    const concrete = await requestGraphQL<{
      node: { notifications: NotificationConnection } | null;
      sourcePosts: Array<{ id: string; profile: { id: string } | null } | null>;
    }>(
      `query ReplyNotificationConcreteSources($id: ID!, $postIds: [ID!]!) {
        node(id: $id) {
          ... on Profile {
            notifications(first: 10) {
              edges { node { __typename id ... on ReplyNotification { profile { id } post { id } } } }
            }
          }
        }
        sourcePosts: nodes(ids: $postIds) { ... on Post { id profile { id } } }
      }`,
      { id: recipientId, postIds },
      auth.token,
    );
    assertNoGraphQLErrors(concrete);
    assert.deepEqual(
      concrete.data?.node?.notifications.edges.map(({ node }) => node.post?.id).sort(),
      concrete.data?.sourcePosts.map((post) => post?.id).sort(),
    );
    assert.deepEqual(
      concrete.data?.node?.notifications.edges.map(({ node }) => node.profile?.id).sort(),
      concrete.data?.sourcePosts.map((post) => post?.profile?.id).sort(),
    );
  });

  test('resolves legacy and approved Quote notifications through Node, list, unread count and Read', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('quote-recipient');
    const quoteAuthor = await createProfile('quote-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const quoteFixtures = await Promise.all(
      [null, PostQuoteConsentStatus.APPROVED].map((quoteConsentStatus) =>
        createQuoteNotificationFixture(recipient.id, quoteAuthor.id, quoteConsentStatus),
      ),
    );
    const notificationIds = quoteFixtures.map(({ notification }) =>
      encodeGlobalId('QuoteNotification', notification.id),
    );
    const quoteIds = quoteFixtures.map(({ quote }) => encodeGlobalId('Post', quote.id));
    const notificationId = notificationIds[0]!;
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const quoteAuthorId = encodeGlobalId('Profile', quoteAuthor.id);

    const result = await requestGraphQL<{
      node: NotificationNode | null;
      nodes: Array<{ id: string; post: { id: string }; profile: { id: string } } | null>;
      sourcePosts: Array<{ id: string } | null>;
      sourceProfile: { id: string } | null;
      profile: {
        unreadNotificationCount: number;
        notifications: { edges: Array<{ node: { id: string } }> };
      } | null;
    }>(
      `query QuoteNotification($notificationId: ID!, $notificationIds: [ID!]!, $profileId: ID!, $quoteIds: [ID!]!, $quoteAuthorId: ID!) {
        node(id: $notificationId) {
          __typename
          ... on QuoteNotification { post { id } profile { id } }
        }
        nodes(ids: $notificationIds) {
          ... on QuoteNotification { id post { id } profile { id } }
        }
        sourcePosts: nodes(ids: $quoteIds) { ... on Post { id } }
        sourceProfile: node(id: $quoteAuthorId) { ... on Profile { id } }
        profile: node(id: $profileId) {
          ... on Profile {
            unreadNotificationCount
            notifications(first: 10) {
              edges { node { id ... on QuoteNotification { post { id } profile { id } } } }
            }
          }
        }
      }`,
      {
        notificationId,
        notificationIds,
        profileId: recipientId,
        quoteIds,
        quoteAuthorId,
      },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'QuoteNotification',
      post: { id: quoteIds[0] },
      profile: { id: quoteAuthorId },
    });
    assert.equal(result.data?.node?.post?.id, result.data?.sourcePosts[0]?.id);
    assert.equal(result.data?.node?.profile?.id, result.data?.sourceProfile?.id);
    assert.deepEqual(
      result.data?.nodes.map((node) => node?.id).sort(),
      [...notificationIds].sort(),
    );
    assert.deepEqual(result.data?.nodes.map((node) => node?.post?.id).sort(), [...quoteIds].sort());
    assert.deepEqual(
      result.data?.nodes.map((node) => node?.profile?.id),
      [quoteAuthorId, quoteAuthorId],
    );
    assert.equal(result.data?.profile?.unreadNotificationCount, 2);
    assert.deepEqual(
      result.data?.profile?.notifications.edges.map(({ node }) => node.id).sort(),
      [...notificationIds].sort(),
    );

    const read = await markNotificationRead(notificationIds, auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...notificationIds].sort(),
    );
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ post }) => post?.id).sort(),
      [...quoteIds].sort(),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
  });

  test('keeps stored Quote notifications visible when consent changes', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('quote-consent-recipient');
    const quoteAuthor = await createProfile('quote-consent-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const notifications = await Promise.all(
      [
        PostQuoteConsentStatus.PENDING,
        PostQuoteConsentStatus.REJECTED,
        PostQuoteConsentStatus.REVOKED,
      ].map(async (quoteConsentStatus) => {
        const { notification } = await createQuoteNotificationFixture(
          recipient.id,
          quoteAuthor.id,
          quoteConsentStatus,
        );
        return notification;
      }),
    );
    const notificationIds = notifications.map(({ id }) => encodeGlobalId('QuoteNotification', id));
    const recipientId = encodeGlobalId('Profile', recipient.id);

    assert.deepEqual(
      await loadNodes(notificationIds, auth.token),
      notificationIds.map((id) => ({ id })),
    );

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => node.id).sort(),
      [...notificationIds].sort(),
    );
    const counts = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(counts);
    assert.equal(counts.data?.nodes[0]?.unreadNotificationCount, notifications.length);
    const read = await markNotificationRead(notificationIds, auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...notificationIds].sort(),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(
      (await Promise.all(notifications.map(({ id }) => notificationReadAt(id)))).every(Boolean),
    );
  });

  test('keeps a Quote notification while its direct Source field is unavailable', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('quote-hidden-recipient');
    const quoteAuthor = await createProfile('quote-hidden-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const source = await createContentPost(recipient.id);
    const quote = await db
      .insert(Posts)
      .values({
        profileId: quoteAuthor.id,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const content = await db
      .insert(PostContents)
      .values({ document: postContentDocumentFromText('hidden quote'), postId: quote.id })
      .returning()
      .then(firstOrThrow);
    await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, quote.id));
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.QUOTE,
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
        recipientProfileId: recipient.id,
        sourceId: quote.id,
      })
      .returning()
      .then(firstOrThrow);
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, source.id));

    const notificationId = encodeGlobalId('QuoteNotification', notification.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    assert.deepEqual(await loadNodes([notificationId], auth.token), [{ id: notificationId }]);
    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => [node.id, node.post?.id]),
      [[notificationId, encodeGlobalId('Post', quote.id)]],
    );
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 1);

    const nestedSource = await requestGraphQL<{
      node: { post: { id: string; repostSource: { id: string } | null } | null } | null;
    }>(
      `query QuoteNotificationNestedSource($id: ID!) {
        node(id: $id) { ... on QuoteNotification { post { id repostSource { id } } } }
      }`,
      { id: notificationId },
      auth.token,
    );
    assertNoGraphQLErrors(nestedSource);
    assert.deepEqual(nestedSource.data?.node, {
      post: { id: encodeGlobalId('Post', quote.id), repostSource: null },
    });

    const read = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id),
      [notificationId],
    );
    assert.ok(await notificationReadAt(notification.id));
  });

  test('resolves Mention source fields independently of recipient-owned row visibility', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = auth.profile;
    const otherRecipient = await createProfile('mention-other-recipient');
    const author = await createProfile('mention-author');
    await addMembership(auth.account.id, otherRecipient.id, AccountProfileRole.MEMBER);

    const post = await createContentPost(author.id);
    await db.insert(PostMentions).values({
      postContentId: post.currentContentId!,
      profileId: recipient.id,
    });
    const notification = await createMentionNotification(recipient.id, post.id);

    const mismatchedPost = await createContentPost(author.id);
    await db.insert(PostMentions).values({
      postContentId: mismatchedPost.currentContentId!,
      profileId: otherRecipient.id,
    });
    const mismatchedNotification = await createMentionNotification(recipient.id, mismatchedPost.id);

    const stalePost = await createContentPost(author.id);
    await db.insert(PostMentions).values({
      postContentId: stalePost.currentContentId!,
      profileId: recipient.id,
    });
    const staleNotification = await createMentionNotification(recipient.id, stalePost.id);
    const newerContent = await db
      .insert(PostContents)
      .values({
        document: postContentDocumentFromText('updated without mention'),
        postId: stalePost.id,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .update(Posts)
      .set({ currentContentId: newerContent.id })
      .where(eq(Posts.id, stalePost.id));

    const notificationId = encodeGlobalId('MentionNotification', notification.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const postId = encodeGlobalId('Post', post.id);
    const authorId = encodeGlobalId('Profile', author.id);
    const result = await requestGraphQL<{
      node: {
        __typename: string;
        profile: { id: string };
        post: { id: string; profile: { id: string } } | null;
      } | null;
      sourcePost: { id: string; profile: { id: string } | null } | null;
      sourceAuthor: { id: string } | null;
      profile: {
        unreadNotificationCount: number;
        notifications: { edges: Array<{ node: NotificationNode }> };
      } | null;
    }>(
      `query MentionNotification($notificationId: ID!, $profileId: ID!, $postId: ID!, $authorId: ID!) {
        node(id: $notificationId) {
          __typename
          ... on MentionNotification { profile { id } post { id profile { id } } }
        }
        sourcePost: node(id: $postId) { ... on Post { id profile { id } } }
        sourceAuthor: node(id: $authorId) { ... on Profile { id } }
        profile: node(id: $profileId) {
          ... on Profile {
            unreadNotificationCount
            notifications(first: 10) {
              edges {
                node {
                  __typename
                  id
                  ... on MentionNotification { profile { id } post { id profile { id } } }
                }
              }
            }
          }
        }
      }`,
      { notificationId, profileId: recipientId, postId, authorId },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'MentionNotification',
      profile: { id: encodeGlobalId('Profile', author.id) },
      post: {
        id: encodeGlobalId('Post', post.id),
        profile: { id: encodeGlobalId('Profile', author.id) },
      },
    });
    assert.equal(result.data?.node?.post?.id, result.data?.sourcePost?.id);
    assert.equal(result.data?.node?.post?.profile.id, result.data?.sourcePost?.profile?.id);
    assert.equal(result.data?.node?.profile.id, result.data?.sourceAuthor?.id);
    assert.deepEqual(
      result.data?.profile?.notifications.edges.map(({ node }) => node.id).sort(),
      [
        notificationId,
        encodeGlobalId('MentionNotification', mismatchedNotification.id),
        encodeGlobalId('MentionNotification', staleNotification.id),
      ].sort(),
    );
    assert.equal(result.data?.profile?.unreadNotificationCount, 3);

    const hiddenIds = [
      encodeGlobalId('MentionNotification', mismatchedNotification.id),
      encodeGlobalId('MentionNotification', staleNotification.id),
    ];
    assert.deepEqual(
      await loadNodes(hiddenIds, auth.token),
      hiddenIds.map((id) => ({ id })),
    );

    const otherRead = await markNotificationRead(hiddenIds, auth.token);
    assertNoGraphQLErrors(otherRead);
    assert.deepEqual(
      otherRead.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...hiddenIds].sort(),
    );
    assert.ok(
      (
        await Promise.all(
          [mismatchedNotification, staleNotification].map(({ id }) => notificationReadAt(id)),
        )
      ).every(Boolean),
    );

    const read = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(read);
    assert.equal(read.data?.markNotificationRead.notifications[0]?.id, notificationId);
    assert.equal(
      read.data?.markNotificationRead.notifications[0]?.post?.id,
      encodeGlobalId('Post', post.id),
    );
    assert.equal(
      read.data?.markNotificationRead.notifications[0]?.profile?.id,
      encodeGlobalId('Profile', author.id),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
  });

  test('keeps a Quote actor visible when the Post loader denies the source', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('quote-loader-recipient');
    const quoteAuthor = await createProfile('quote-loader-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    await createFollow(quoteAuthor.id, recipient.id);

    const source = await createContentPost(recipient.id);
    const quote = await db
      .insert(Posts)
      .values({
        profileId: quoteAuthor.id,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.FOLLOWERS,
      })
      .returning()
      .then(firstOrThrow);
    const content = await db
      .insert(PostContents)
      .values({ document: postContentDocumentFromText('loader quote'), postId: quote.id })
      .returning()
      .then(firstOrThrow);
    await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, quote.id));
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.QUOTE,
        recipientAccountId: await notificationRecipientAccountId(recipient.id),
        recipientProfileId: recipient.id,
        sourceId: quote.id,
      })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      node: { id: string } | null;
      notification: {
        post: { id: string } | null;
        profile: { id: string } | null;
      } | null;
      recipient: {
        notifications: {
          edges: Array<{
            node: {
              post: { id: string } | null;
              profile: { id: string } | null;
            };
          }>;
        };
      } | null;
      sourcePost: { id: string } | null;
    }>(
      `query QuoteNotificationPostAccess($notificationId: ID!, $quoteAuthorId: ID!, $quotePostId: ID!, $recipientId: ID!) {
        notification: node(id: $notificationId) {
          ... on QuoteNotification { profile { id } post { id } }
        }
        node(id: $quoteAuthorId) { ... on Profile { id } }
        sourcePost: node(id: $quotePostId) { ... on Post { id } }
        recipient: node(id: $recipientId) {
          ... on Profile {
            notifications(first: 10) {
              edges { node { ... on QuoteNotification { profile { id } post { id } } } }
            }
          }
        }
      }`,
      {
        notificationId: encodeGlobalId('QuoteNotification', notification.id),
        quoteAuthorId: encodeGlobalId('Profile', quoteAuthor.id),
        quotePostId: encodeGlobalId('Post', quote.id),
        recipientId: encodeGlobalId('Profile', recipient.id),
      },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.notification, {
      profile: { id: encodeGlobalId('Profile', quoteAuthor.id) },
      post: null,
    });
    assert.deepEqual(result.data?.node, { id: encodeGlobalId('Profile', quoteAuthor.id) });
    assert.equal(result.data?.sourcePost, null);
    assert.deepEqual(result.data?.recipient?.notifications.edges, [
      {
        node: {
          profile: { id: encodeGlobalId('Profile', quoteAuthor.id) },
          post: null,
        },
      },
    ]);
  });

  test('Reply Notification row를 GraphQL source로 읽는다', async () => {
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
    await createReplyNotificationFixture(recipient.id, reply.id);
    assert.equal(
      await db.$count(
        Notifications,
        and(eq(Notifications.kind, NotificationKind.REPLY), eq(Notifications.sourceId, reply.id)),
      ),
      1,
    );
  });

  test('Local Reply 작성부터 thread 반영·inbox·Read·결과 Reply 이동 대상까지 수직 흐름을 유지한다', async () => {
    const parentAuthor = await createAuthenticatedSession();
    const replyAuthor = await createAuthenticatedSession();
    const parent = await createContentPost(parentAuthor.profile.id);

    const created = await requestCreateReply(parent.id, replyAuthor.token, PostVisibility.UNLISTED);
    assertNoGraphQLErrors(created);
    const replyId = created.data?.createPost.post.id;
    assert.ok(replyId);
    const reply = await db
      .select()
      .from(Posts)
      .where(eq(Posts.replyParentId, parent.id))
      .then(firstOrThrow);
    await createReplyNotificationFixture(parentAuthor.profile.id, reply.id);

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
    assert.equal(notification?.profile?.id, encodeGlobalId('Profile', replyAuthor.profile.id));
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

  test('keeps Reply Notifications through pagination and Read when their source is unavailable', async () => {
    const viewer = await createAuthenticatedSession();
    const recipient = await createProfile('reply-hidden-recipient');
    await addMembership(viewer.account.id, recipient.id, AccountProfileRole.OWNER);
    const parent = await createContentPost(recipient.id);
    const olderCreatedAt = Temporal.Instant.from('2026-10-15T00:00:00Z');
    const newerCreatedAt = Temporal.Instant.from('2026-10-16T00:00:00Z');
    const visibleAuthor = await createAuthenticatedSession();
    assertNoGraphQLErrors(await requestCreateReply(parent.id, visibleAuthor.token));
    const visible = await db
      .select()
      .from(Posts)
      .where(eq(Posts.replyParentId, parent.id))
      .then(firstOrThrow);
    const visibleNotification = await createReplyNotificationFixture(
      recipient.id,
      visible.id,
      '00000000-0000-8006-8000-000000000800',
      olderCreatedAt,
    );
    const hiddenAuthor = await createAuthenticatedSession();
    assertNoGraphQLErrors(await requestCreateReply(parent.id, hiddenAuthor.token));
    const hidden = await db
      .select()
      .from(Posts)
      .where(and(eq(Posts.replyParentId, parent.id), ne(Posts.id, visible.id)))
      .then(firstOrThrow);
    const hiddenNotification = await createReplyNotificationFixture(
      recipient.id,
      hidden.id,
      '00000000-0000-8006-8000-000000000900',
      newerCreatedAt,
    );
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, hiddenAuthor.profile.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const connection = await loadNotificationConnection(recipientId, viewer.token, { first: 1 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('ReplyNotification', hiddenNotification.id)],
    );
    const hiddenNode = connection.data?.node?.notifications.edges[0]?.node;
    assert.equal(hiddenNode?.post, null);
    assert.equal(hiddenNode?.profile, null);
    assert.equal(connection.data?.node?.notifications.pageInfo.hasNextPage, true);

    const nextPage = await loadNotificationConnection(recipientId, viewer.token, {
      after: connection.data?.node?.notifications.pageInfo.endCursor,
      first: 1,
    });
    assertNoGraphQLErrors(nextPage);
    assert.deepEqual(
      nextPage.data?.node?.notifications.edges.map(({ node }) => node.id),
      [encodeGlobalId('ReplyNotification', visibleNotification.id)],
    );

    const count = await loadUnreadNotificationCounts([recipientId], viewer.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 2);

    const hiddenId = encodeGlobalId('ReplyNotification', hiddenNotification.id);
    assert.deepEqual(await loadNodes([hiddenId], viewer.token), [{ id: hiddenId }]);
    const read = await markNotificationRead([hiddenId], viewer.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id),
      [hiddenId],
    );
    assert.equal(read.data?.markNotificationRead.notifications[0]?.post, null);
    assert.equal(read.data?.markNotificationRead.notifications[0]?.profile, null);
    assert.ok(await notificationReadAt(hiddenNotification.id));
    const countAfterRead = await loadUnreadNotificationCounts([recipientId], viewer.token);
    assertNoGraphQLErrors(countAfterRead);
    assert.equal(countAfterRead.data?.nodes[0]?.unreadNotificationCount, 1);
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
    await createReplyNotificationFixture(recipient.id, reply.id);
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
    await db
      .update(Sessions)
      .set({ activeProfileId: recipient.id })
      .where(eq(Sessions.id, auth.session.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const reactionId = encodeGlobalId('ReactionNotification', reaction.notification.id);
    const reactionSourceId = encodeGlobalId('Reaction', reaction.reaction.id);
    const postId = encodeGlobalId('Post', reaction.post.id);
    const authorId = encodeGlobalId('Profile', author.id);

    const node = await requestGraphQL<{
      notification: NotificationNode | null;
      source: { type: string } | null;
      post: { id: string } | null;
      profile: { id: string } | null;
    }>(
      `query ReactionNotificationNode($id: ID!, $sourceId: ID!, $postId: ID!, $profileId: ID!) {
        notification: node(id: $id) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on ReactionNotification { type profile { id } post { id } }
        }
        source: node(id: $sourceId) { ... on Reaction { type } }
        post: node(id: $postId) { ... on Post { id } }
        profile: node(id: $profileId) { ... on Profile { id } }
      }`,
      { id: reactionId, sourceId: reactionSourceId, postId, profileId: authorId },
      auth.token,
    );
    assertNoGraphQLErrors(node);
    assert.equal(node.data?.notification?.__typename, 'ReactionNotification');
    assert.equal(node.data?.notification?.type, '🎉');
    assert.equal(node.data?.notification?.type, node.data?.source?.type);
    assert.equal(node.data?.notification?.profile?.id, node.data?.profile?.id);
    assert.equal(node.data?.notification?.post?.id, node.data?.post?.id);

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
      .set({ visibility: PostVisibility.PUBLIC })
      .where(eq(Posts.id, repost.repost.id));
    await db
      .update(Sessions)
      .set({ activeProfileId: recipient.id })
      .where(eq(Sessions.id, auth.session.id));
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const repostId = encodeGlobalId('RepostNotification', repost.notification.id);
    const repostPostId = encodeGlobalId('Post', repost.repost.id);

    const node = await requestGraphQL<{
      notification: NotificationNode | null;
      source: {
        id: string;
        profile: { id: string } | null;
        repostSource: { id: string } | null;
      } | null;
    }>(
      `query RepostNotificationNode($id: ID!, $sourceId: ID!) {
        notification: node(id: $id) {
          __typename
          ... on Notification { id createdAt readAt }
          ... on RepostNotification { profile { id } post { id } }
        }
        source: node(id: $sourceId) {
          ... on Post { id profile { id } repostSource { id } }
        }
      }`,
      { id: repostId, sourceId: repostPostId },
      auth.token,
    );
    assertNoGraphQLErrors(node);
    assert.equal(node.data?.notification?.__typename, 'RepostNotification');
    assert.equal(node.data?.notification?.profile?.id, node.data?.source?.profile?.id);
    assert.equal(node.data?.notification?.post?.id, node.data?.source?.repostSource?.id);
    assert.equal(node.data?.notification?.profile?.id, encodeGlobalId('Profile', author.id));
    assert.equal(node.data?.notification?.post?.id, encodeGlobalId('Post', repost.post.id));

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
      read.data?.markNotificationRead.notifications[0]?.profile?.id,
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
    await createOperationalNotification(auth.account.id, {
      href: '/account-notice',
      title: 'Account notice',
    });

    const foreignAccount = await createAuthenticatedSession();
    await createOperationalNotification(foreignAccount.account.id, {
      href: '/foreign-account-notice',
      title: 'Foreign account notice',
    });

    const selectedElsewhere = await loadUnreadNotificationCounts(profileIds, auth.token);
    assertNoGraphQLErrors(selectedElsewhere);
    assert.deepEqual(
      selectedElsewhere.data?.nodes.map((profile) => profile?.unreadNotificationCount),
      profileIds.map(() => 2),
    );

    await db
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.id, auth.session.id));
    const withoutSelection = await loadUnreadNotificationCounts(profileIds, auth.token);
    assertNoGraphQLErrors(withoutSelection);
    assert.deepEqual(
      withoutSelection.data?.nodes.map((profile) => profile?.unreadNotificationCount),
      profileIds.map(() => 2),
    );

    const unrelated = await createAuthenticatedSession();
    const withoutMembership = await loadUnreadNotificationCounts(profileIds, unrelated.token);
    assert.deepEqual(
      withoutMembership.data?.nodes,
      profileIds.map((id) => ({ id, unreadNotificationCount: null })),
    );
    assert.equal(withoutMembership.errors?.length, profileIds.length);
    assert.ok(
      withoutMembership.errors?.every(({ extensions }) => extensions?.code === 'PERMISSION_DENIED'),
    );

    const unauthenticated = await loadUnreadNotificationCounts([profileIds[0]!]);
    assert.deepEqual(unauthenticated.data?.nodes, [
      { id: profileIds[0], unreadNotificationCount: null },
    ]);
    assert.equal(unauthenticated.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  });

  test('counts all unread recipient notifications regardless of source availability', async () => {
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
      recipientAccountId: auth.account.id,
      recipientProfileId: recipient.id,
      sourceId: crypto.randomUUID(),
    });

    const actualFollowee = await createProfile('count-actual-followee');
    const mismatchRelated = await createProfile('count-mismatch-related');
    const mismatchSource = await createFollow(actualFollowee.id, mismatchRelated.id);
    await db.insert(Notifications).values({
      kind: NotificationKind.FOLLOW,
      recipientAccountId: auth.account.id,
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
    assert.equal(result.data?.nodes[0]?.unreadNotificationCount, 4);

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

  test('paginates recipient-owned Notifications chronologically including unavailable sources', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('page-recipient');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const pageTimes = {
      newest: Temporal.Instant.from('2026-10-16T00:00:05Z'),
      missingSource: Temporal.Instant.from('2026-10-16T00:00:04Z'),
      read: Temporal.Instant.from('2026-10-16T00:00:03Z'),
      mismatch: Temporal.Instant.from('2026-10-16T00:00:02Z'),
      oldest: Temporal.Instant.from('2026-10-16T00:00:01Z'),
      hidden: Temporal.Instant.from('2026-10-16T00:00:00Z'),
    };

    const newestRelated = await createProfile('page-newest-related');
    const newest = await createFollowNotification(
      recipient.id,
      newestRelated.id,
      '00000000-0000-8006-8000-000000000900',
      auth.account.id,
      pageTimes.newest,
    );

    const missingSource = await db
      .insert(Notifications)
      .values({
        id: '00000000-0000-8006-8000-000000000800',
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
        createdAt: pageTimes.missingSource,
      })
      .returning()
      .then(firstOrThrow);

    const readRelated = await createProfile('page-read-related');
    const read = await createFollowNotification(
      recipient.id,
      readRelated.id,
      '00000000-0000-8006-8000-000000000700',
      auth.account.id,
      pageTimes.read,
    );
    const readResult = await markNotificationRead(
      [encodeGlobalId('FollowNotification', read.id)],
      auth.token,
    );
    assertNoGraphQLErrors(readResult);

    const mismatchFollowee = await createProfile('page-mismatch-followee');
    const mismatchFollower = await createProfile('page-mismatch-follower');
    const mismatchSource = await createFollow(mismatchFollowee.id, mismatchFollower.id);
    const mismatch = await db
      .insert(Notifications)
      .values({
        id: '00000000-0000-8006-8000-000000000600',
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: mismatchSource.id,
        createdAt: pageTimes.mismatch,
      })
      .returning()
      .then(firstOrThrow);

    const oldestRelated = await createProfile('page-oldest-related');
    const oldest = await createFollowNotification(
      recipient.id,
      oldestRelated.id,
      '00000000-0000-8006-8000-000000000500',
      auth.account.id,
      pageTimes.oldest,
    );

    const hiddenRelated = await createProfile('page-hidden-related');
    const hidden = await createFollowNotification(
      recipient.id,
      hiddenRelated.id,
      '00000000-0000-8006-8000-000000000400',
      auth.account.id,
      pageTimes.hidden,
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
      [newest.id, missingSource.id].map((id) => encodeGlobalId('FollowNotification', id)),
    );
    assert.equal(firstConnection?.edges[1]?.node.profile, null);
    assert.equal(firstConnection?.edges[1]?.node.readAt, null);
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
      [read.id, mismatch.id].map((id) => encodeGlobalId('FollowNotification', id)),
    );
    assert.equal(
      secondConnection?.edges[0]?.node.profile?.id,
      encodeGlobalId('Profile', readRelated.id),
    );
    const directMismatchSource = await requestGraphQL<{
      source: { follower: { id: string } | null } | null;
    }>(
      `query MismatchedFollowSourceProfile($sourceId: ID!) {
        source: node(id: $sourceId) { ... on ProfileFollow { follower { id } } }
      }`,
      { sourceId: encodeGlobalId('ProfileFollow', mismatchSource.id) },
      auth.token,
    );
    assertNoGraphQLErrors(directMismatchSource);
    assert.equal(
      secondConnection?.edges[1]?.node.profile?.id,
      directMismatchSource.data?.source?.follower?.id,
    );
    assert.equal(secondConnection?.pageInfo.hasNextPage, true);

    const third = await loadNotificationConnection(profileId, auth.token, {
      after: secondConnection?.pageInfo.endCursor,
      first: 2,
    });
    assertNoGraphQLErrors(third);
    const thirdConnection = third.data?.node?.notifications;
    assert.deepEqual(
      thirdConnection?.edges.map(({ node }) => node.id),
      [oldest.id, hidden.id].map((id) => encodeGlobalId('FollowNotification', id)),
    );
    assert.equal(
      thirdConnection?.edges[0]?.node.profile?.id,
      encodeGlobalId('Profile', oldestRelated.id),
    );
    assert.equal(thirdConnection?.edges[1]?.node.profile, null);
    assert.equal(thirdConnection?.pageInfo.hasNextPage, false);
  });

  test('paginates mixed notification kinds when a Repost source is unavailable', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('mixed-page-recipient');
    const author = await createProfile('mixed-page-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    const pageTimes = {
      newest: Temporal.Instant.from('2026-10-16T00:00:05Z'),
      unavailableRepost: Temporal.Instant.from('2026-10-16T00:00:04Z'),
      reaction: Temporal.Instant.from('2026-10-16T00:00:03Z'),
      repost: Temporal.Instant.from('2026-10-16T00:00:02Z'),
      oldest: Temporal.Instant.from('2026-10-16T00:00:01Z'),
    };

    const newest = await createFollowNotification(
      recipient.id,
      author.id,
      '00000000-0000-8006-8000-000000000900',
      auth.account.id,
      pageTimes.newest,
    );
    const unavailableRepost = await db
      .insert(Notifications)
      .values({
        id: '00000000-0000-8006-8000-000000000800',
        kind: NotificationKind.REPOST,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
        createdAt: pageTimes.unavailableRepost,
      })
      .returning()
      .then(firstOrThrow);
    const reaction = await createReactionNotification(
      recipient.id,
      author.id,
      '👀',
      '00000000-0000-8006-8000-000000000700',
      pageTimes.reaction,
    );
    const repost = await createRepostNotification(
      recipient.id,
      author.id,
      '00000000-0000-8006-8000-000000000600',
      pageTimes.repost,
    );
    const oldest = await createFollowNotification(
      recipient.id,
      await createProfile('mixed-page-oldest-author').then(({ id }) => id),
      '00000000-0000-8006-8000-000000000500',
      auth.account.id,
      pageTimes.oldest,
    );
    const profileId = encodeGlobalId('Profile', recipient.id);

    const first = await loadNotificationConnection(profileId, auth.token, { first: 2 });
    assertNoGraphQLErrors(first);
    const firstConnection = first.data?.node?.notifications;
    assert.deepEqual(
      firstConnection?.edges.map(({ node }) => [node.__typename, node.id]),
      [
        ['FollowNotification', encodeGlobalId('FollowNotification', newest.id)],
        ['RepostNotification', encodeGlobalId('RepostNotification', unavailableRepost.id)],
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
        ['ReactionNotification', encodeGlobalId('ReactionNotification', reaction.notification.id)],
        ['RepostNotification', encodeGlobalId('RepostNotification', repost.notification.id)],
      ],
    );
    assert.equal(second.data?.node?.notifications.pageInfo.hasNextPage, true);

    const third = await loadNotificationConnection(profileId, auth.token, {
      after: second.data?.node?.notifications.pageInfo.endCursor,
      first: 2,
    });
    assertNoGraphQLErrors(third);
    assert.deepEqual(
      third.data?.node?.notifications.edges.map(({ node }) => [node.__typename, node.id]),
      [['FollowNotification', encodeGlobalId('FollowNotification', oldest.id)]],
    );
    assert.equal(third.data?.node?.notifications.pageInfo.hasNextPage, false);
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

  test('Notification Node checks recipient membership independently of source availability', async () => {
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
        recipientAccountId: auth.account.id,
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
        recipientAccountId: auth.account.id,
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

    const foreignRecipient = await createProfile('foreign-recipient');
    const foreignRelated = await createProfile('foreign-related');
    const foreignNotification = await createFollowNotification(
      foreignRecipient.id,
      foreignRelated.id,
    );

    const ids = [
      inactiveRecipientNotification.id,
      missingSourceNotification.id,
      mismatchNotification.id,
      hiddenRelatedNotification.id,
      foreignNotification.id,
    ].map((id) => encodeGlobalId('FollowNotification', id));
    assert.deepEqual(await loadNodes(ids, auth.token), [
      ...ids.slice(0, 4).map((id) => ({ id })),
      null,
    ]);
  });

  test('keeps Reaction notification rows when their original source or actor is unavailable', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('reaction-hidden-recipient');
    const author = await createProfile('reaction-hidden-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.REACTION,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const actualRecipient = await createProfile('reaction-actual-recipient');
    const mismatchSource = await createReactionNotification(actualRecipient.id, author.id, '👀');
    const mismatch = await db
      .update(Notifications)
      .set({ recipientAccountId: auth.account.id, recipientProfileId: recipient.id })
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
      ids.map((id) => ({ id })),
    );

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    const connectionNodes = new Map(
      connection.data?.node?.notifications.edges.map(({ node }) => [node.id, node]) ?? [],
    );
    assert.deepEqual([...connectionNodes.keys()].sort(), [...ids].sort());
    const missingSourceId = encodeGlobalId('ReactionNotification', missingSource.id);
    const mismatchId = encodeGlobalId('ReactionNotification', mismatch.id);
    const deletedPostId = encodeGlobalId('ReactionNotification', deletedPost.notification.id);
    const hiddenAuthorId = encodeGlobalId('ReactionNotification', hidden.notification.id);
    const mismatchReactionId = encodeGlobalId('Reaction', mismatchSource.reaction.id);
    const mismatchPostId = encodeGlobalId('Post', mismatchSource.post.id);
    const mismatchProfileId = encodeGlobalId('Profile', author.id);
    const deletedReactionId = encodeGlobalId('Reaction', deletedPost.reaction.id);
    const deletedPostNodeId = encodeGlobalId('Post', deletedPost.post.id);
    const missingReactionId = encodeGlobalId('Reaction', missingSource.sourceId);
    const hiddenReactionId = encodeGlobalId('Reaction', hidden.reaction.id);
    const hiddenPostId = encodeGlobalId('Post', hidden.post.id);
    const hiddenProfileId = encodeGlobalId('Profile', hiddenAuthor.id);
    const directSources = await requestGraphQL<{
      nodes: Array<{ __typename: string; id: string; type?: string } | null>;
    }>(
      `query ReactionSourceNodes($ids: [ID!]!) {
        nodes(ids: $ids) {
          __typename
          id
          ... on Reaction { type }
        }
      }`,
      {
        ids: [
          missingReactionId,
          mismatchReactionId,
          mismatchPostId,
          mismatchProfileId,
          deletedReactionId,
          deletedPostNodeId,
          hiddenReactionId,
          hiddenPostId,
          hiddenProfileId,
        ],
      },
      auth.token,
    );
    assertNoGraphQLErrors(directSources);
    const directSourcesById = new Map(
      directSources.data?.nodes
        .filter((node): node is NonNullable<typeof node> => node !== null)
        .map((node) => [node.id, node]) ?? [],
    );
    assert.equal(connectionNodes.get(missingSourceId)?.type, null);
    assert.equal(connectionNodes.get(missingSourceId)?.profile, null);
    assert.equal(connectionNodes.get(missingSourceId)?.post, null);
    assert.equal(directSourcesById.get(missingReactionId), undefined);
    assert.equal(
      connectionNodes.get(mismatchId)?.type,
      directSourcesById.get(mismatchReactionId)?.type,
    );
    assert.equal(
      connectionNodes.get(mismatchId)?.profile?.id,
      directSourcesById.get(mismatchProfileId)?.id,
    );
    assert.equal(
      connectionNodes.get(mismatchId)?.post?.id,
      directSourcesById.get(mismatchPostId)?.id,
    );
    assert.equal(directSourcesById.get(deletedReactionId), undefined);
    assert.equal(directSourcesById.get(deletedPostNodeId), undefined);
    assert.equal(connectionNodes.get(deletedPostId)?.type, null);
    assert.equal(directSourcesById.get(mismatchProfileId)?.id, mismatchProfileId);
    assert.equal(connectionNodes.get(deletedPostId)?.profile?.id, mismatchProfileId);
    assert.equal(connectionNodes.get(deletedPostId)?.post, null);
    assert.equal(
      connectionNodes.get(hiddenAuthorId)?.type,
      directSourcesById.get(hiddenReactionId)?.type,
    );
    assert.equal(
      connectionNodes.get(hiddenAuthorId)?.profile?.id,
      directSourcesById.get(hiddenProfileId)?.id,
    );
    assert.equal(
      connectionNodes.get(hiddenAuthorId)?.post?.id,
      directSourcesById.get(hiddenPostId)?.id,
    );

    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, notifications.length);

    const read = await markNotificationRead(ids, auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...ids].sort(),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(
      (await Promise.all(notifications.map(({ id }) => notificationReadAt(id)))).every(Boolean),
    );
  });

  test('keeps Repost notification rows when their source is unavailable', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('repost-hidden-recipient');
    const author = await createProfile('repost-hidden-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);

    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.REPOST,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);

    const actualRecipient = await createProfile('repost-actual-recipient');
    const mismatchSource = await createRepostNotification(actualRecipient.id, author.id);
    const mismatch = await db
      .update(Notifications)
      .set({ recipientAccountId: auth.account.id, recipientProfileId: recipient.id })
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
      ids.map((id) => ({ id })),
    );

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => node.id).sort(),
      [...ids].sort(),
    );

    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, notifications.length);

    const read = await markNotificationRead(ids, auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...ids].sort(),
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(
      (await Promise.all(notifications.map(({ id }) => notificationReadAt(id)))).every(Boolean),
    );
  });

  test('returns the actor and public target when the direct Repost Post is unavailable', async () => {
    const auth = await createAuthenticatedSession();
    const recipient = await createProfile('direct-repost-notification-recipient');
    const repostAuthor = await createProfile('direct-repost-notification-author');
    const originalAuthor = await createProfile('direct-repost-notification-original-author');
    await addMembership(auth.account.id, recipient.id, AccountProfileRole.OWNER);
    assert.notEqual(auth.profile.id, recipient.id);
    assert.notEqual(auth.profile.id, repostAuthor.id);
    assert.notEqual(auth.profile.id, originalAuthor.id);

    const originalPost = await createContentPost(originalAuthor.id, PostVisibility.PUBLIC);
    const repost = await db
      .insert(Posts)
      .values({
        profileId: repostAuthor.id,
        repostSourceId: originalPost.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.DIRECT,
      })
      .returning()
      .then(firstOrThrow);
    const notification = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.REPOST,
        recipientAccountId: auth.account.id,
        recipientProfileId: recipient.id,
        sourceId: repost.id,
      })
      .returning()
      .then(firstOrThrow);
    const notificationId = encodeGlobalId('RepostNotification', notification.id);
    const recipientId = encodeGlobalId('Profile', recipient.id);
    const repostId = encodeGlobalId('Post', repost.id);
    const originalPostId = encodeGlobalId('Post', originalPost.id);
    const repostAuthorId = encodeGlobalId('Profile', repostAuthor.id);

    const boundary = await requestGraphQL<{
      notification: {
        id: string;
        profile: { id: string } | null;
        post: { id: string } | null;
      } | null;
      repost: { id: string } | null;
      originalPost: { id: string } | null;
      repostAuthor: { id: string } | null;
    }>(
      `query DirectRepostNotification($notificationId: ID!, $repostId: ID!, $originalPostId: ID!, $repostAuthorId: ID!) {
        notification: node(id: $notificationId) {
          ... on RepostNotification { id profile { id } post { id } }
        }
        repost: node(id: $repostId) { ... on Post { id } }
        originalPost: node(id: $originalPostId) { ... on Post { id } }
        repostAuthor: node(id: $repostAuthorId) { ... on Profile { id } }
      }`,
      { notificationId, repostId, originalPostId, repostAuthorId },
      auth.token,
    );
    assertNoGraphQLErrors(boundary);
    assert.deepEqual(boundary.data?.notification, {
      id: notificationId,
      profile: { id: repostAuthorId },
      post: { id: originalPostId },
    });
    assert.equal(boundary.data?.repost, null);
    assert.deepEqual(boundary.data?.originalPost, { id: originalPostId });
    assert.deepEqual(boundary.data?.repostAuthor, { id: repostAuthorId });

    const connection = await loadNotificationConnection(recipientId, auth.token, { first: 10 });
    assertNoGraphQLErrors(connection);
    assert.deepEqual(
      connection.data?.node?.notifications.edges.map(({ node }) => ({
        id: node.id,
        profile: node.profile,
        post: node.post,
      })),
      [
        {
          id: notificationId,
          profile: { id: repostAuthorId },
          post: { id: originalPostId },
        },
      ],
    );
    const count = await loadUnreadNotificationCounts([recipientId], auth.token);
    assertNoGraphQLErrors(count);
    assert.equal(count.data?.nodes[0]?.unreadNotificationCount, 1);

    const read = await markNotificationRead([notificationId], auth.token);
    assertNoGraphQLErrors(read);
    assert.deepEqual(
      read.data?.markNotificationRead.notifications.map(({ id, profile, post }) => ({
        id,
        profile,
        post,
      })),
      [
        {
          id: notificationId,
          profile: { id: repostAuthorId },
          post: { id: originalPostId },
        },
      ],
    );
    assert.equal(read.data?.markNotificationRead.recipientProfiles[0]?.unreadNotificationCount, 0);
    assert.ok(await notificationReadAt(notification.id));
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
      first.data?.markNotificationRead.notifications[0]?.profile?.id,
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

  test('marks recipient-owned Notifications Read when their source is unavailable', async () => {
    const auth = await createAuthenticatedSession();

    const inactiveRecipient = await createProfile('read-inactive-recipient');
    const inactiveRelated = await createProfile('read-inactive-related');
    await addMembership(auth.account.id, inactiveRecipient.id, AccountProfileRole.OWNER);
    const inactiveNotification = await createFollowNotification(
      inactiveRecipient.id,
      inactiveRelated.id,
    );
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, inactiveRecipient.id));

    const unauthorizedRecipient = await createProfile('unauthorized-recipient');
    const unauthorizedRelated = await createProfile('unauthorized-related');
    const unauthorized = await createFollowNotification(
      unauthorizedRecipient.id,
      unauthorizedRelated.id,
    );

    const missingSourceRecipient = await createProfile('read-missing-source-recipient');
    await addMembership(auth.account.id, missingSourceRecipient.id, AccountProfileRole.OWNER);
    const missingSource = await db
      .insert(Notifications)
      .values({
        kind: NotificationKind.FOLLOW,
        recipientAccountId: auth.account.id,
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
        recipientAccountId: auth.account.id,
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

    const unauthorizedId = encodeGlobalId('FollowNotification', unauthorized.id);
    const inactiveId = encodeGlobalId('FollowNotification', inactiveNotification.id);
    const sourceUnavailable = [missingSource, mismatch, hidden];
    const sourceUnavailableIds = sourceUnavailable.map(({ id }) =>
      encodeGlobalId('FollowNotification', id),
    );
    const unknownId = encodeGlobalId('FollowNotification', crypto.randomUUID());
    const mixed = await markNotificationRead(
      [unknownId, unauthorizedId, inactiveId, ...sourceUnavailableIds],
      auth.token,
    );
    assertNoGraphQLErrors(mixed);
    assert.deepEqual(
      mixed.data?.markNotificationRead.notifications.map(({ id }) => id).sort(),
      [...sourceUnavailableIds, inactiveId].sort(),
    );
    const returnedProfiles = new Map<string, number>(
      mixed.data?.markNotificationRead.recipientProfiles.map(
        ({ id, unreadNotificationCount }) => [id, unreadNotificationCount] as const,
      ),
    );
    assert.deepEqual(
      [...returnedProfiles.keys()].sort(),
      [
        encodeGlobalId('Profile', missingSourceRecipient.id),
        encodeGlobalId('Profile', mismatchRecipient.id),
        encodeGlobalId('Profile', hiddenRecipient.id),
      ].sort(),
    );
    assert.equal(returnedProfiles.has(encodeGlobalId('Profile', inactiveRecipient.id)), false);
    assert.ok([...returnedProfiles.values()].every((count) => count === 0));
    const returnedNotifications = new Map(
      mixed.data?.markNotificationRead.notifications.map((notification) => [
        notification.id,
        notification,
      ]),
    );
    assert.equal(returnedNotifications.get(sourceUnavailableIds[0]!)?.profile, null);
    for (const id of sourceUnavailableIds) {
      assert.equal(returnedNotifications.get(id)?.id, id);
    }

    const excluded = await markNotificationRead([unknownId, unauthorizedId], auth.token);
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
    assert.ok(
      (await Promise.all(sourceUnavailable.map(({ id }) => notificationReadAt(id)))).every(Boolean),
    );
    assert.ok(await notificationReadAt(inactiveNotification.id));
    assert.equal(await notificationReadAt(unauthorized.id), null);
  });
});

type NotificationNode = {
  __typename: string;
  createdAt: string;
  followRequest?: { id: string } | null;
  id: string;
  readAt: string | null;
  profile: { id: string } | null;
  post?: { id: string } | null;
  type?: string | null;
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
                ... on FollowRequestNotification { profile { id } followRequest { id } }
                ... on ReactionNotification { type profile { id } post { id } }
                ... on RepostNotification { profile { id } post { id } }
                ... on QuoteNotification { profile { id } post { id } }
                ... on ReplyNotification { profile { id } post { id } }
                ... on MentionNotification { profile { id } post { id } }
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
          ... on QuoteNotification { profile { id } post { id } }
          ... on ReplyNotification { profile { id } post { id } }
          ... on MentionNotification { profile { id } post { id } }
        }
        recipientProfiles { id unreadNotificationCount }
      }
    }`,
    { ids },
    token,
  );

const loadUnreadNotificationCounts = (ids: string[], token?: string) =>
  requestGraphQL<{
    nodes: Array<{ id: string; unreadNotificationCount: number | null } | null>;
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

const notificationRecipientAccountId = async (profileId: string) => {
  const [membership] = await db
    .select({ accountId: AccountProfiles.accountId })
    .from(AccountProfiles)
    .where(eq(AccountProfiles.profileId, profileId))
    .limit(1);
  if (membership) {
    return membership.accountId;
  }

  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Notification Fixture Account',
      oidcSubject: `notification-fixture-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  await addMembership(account.id, profileId, AccountProfileRole.OWNER);
  return account.id;
};

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
  recipientAccountId?: string,
  createdAt?: Temporal.Instant,
) => {
  const source = await createFollow(recipientProfileId, relatedProfileId);
  return db
    .insert(Notifications)
    .values({
      id,
      kind: NotificationKind.FOLLOW,
      recipientAccountId:
        recipientAccountId ?? (await notificationRecipientAccountId(recipientProfileId)),
      recipientProfileId,
      sourceId: source.id,
      ...(createdAt === undefined ? {} : { createdAt }),
    })
    .returning()
    .then(firstOrThrow);
};

const createReplyNotificationFixture = async (
  recipientProfileId: string,
  sourceId: string,
  id?: string,
  createdAt?: Temporal.Instant,
) =>
  db
    .insert(Notifications)
    .values({
      id,
      kind: NotificationKind.REPLY,
      recipientAccountId: await notificationRecipientAccountId(recipientProfileId),
      recipientProfileId,
      sourceId,
      ...(createdAt === undefined ? {} : { createdAt }),
    })
    .returning()
    .then(firstOrThrow);

const createQuoteNotificationFixture = async (
  recipientProfileId: string,
  quoteAuthorProfileId: string,
  quoteConsentStatus: PostQuoteConsentStatus | null,
) => {
  const source = await createContentPost(recipientProfileId);
  const quote = await db
    .insert(Posts)
    .values({
      profileId: quoteAuthorProfileId,
      repostSourceId: source.id,
      quoteConsentStatus,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const quoteContent = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText('quote notification fixture'),
      postId: quote.id,
    })
    .returning()
    .then(firstOrThrow);
  await db.update(Posts).set({ currentContentId: quoteContent.id }).where(eq(Posts.id, quote.id));
  const notification = await db
    .insert(Notifications)
    .values({
      kind: NotificationKind.QUOTE,
      recipientAccountId: await notificationRecipientAccountId(recipientProfileId),
      recipientProfileId,
      sourceId: quote.id,
    })
    .returning()
    .then(firstOrThrow);

  return { notification, quote };
};

const createMentionNotification = async (recipientProfileId: string, sourceId: string) =>
  db
    .insert(Notifications)
    .values({
      kind: NotificationKind.MENTION,
      recipientAccountId: await notificationRecipientAccountId(recipientProfileId),
      recipientProfileId,
      sourceId,
    })
    .returning()
    .then(firstOrThrow);

const createReactionNotification = async (
  recipientProfileId: string,
  authorProfileId: string,
  type: string,
  id?: string,
  createdAt?: Temporal.Instant,
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
      recipientAccountId: await notificationRecipientAccountId(recipientProfileId),
      recipientProfileId,
      sourceId: reaction.id,
      ...(createdAt === undefined ? {} : { createdAt }),
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
  createdAt?: Temporal.Instant,
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
      recipientAccountId: await notificationRecipientAccountId(recipientProfileId),
      recipientProfileId,
      sourceId: repost.id,
      ...(createdAt === undefined ? {} : { createdAt }),
    })
    .returning()
    .then(firstOrThrow);

  return { notification, post, repost };
};

const createAuthenticatedSession = async (accountState: AccountState = AccountState.ACTIVE) => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: accountState,
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

const createOperationalNotification = (
  recipientAccountId: string,
  data: CoreDb.OperationalNotificationData,
) =>
  db
    .insert(Notifications)
    .values({
      data,
      kind: NotificationKind.OPERATIONAL,
      recipientAccountId,
      recipientProfileId: null,
      sourceId: crypto.randomUUID(),
    })
    .returning()
    .then(firstOrThrow);

const resetFixtures = async () => {
  await waitForProfileFollowWorkflows();
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
