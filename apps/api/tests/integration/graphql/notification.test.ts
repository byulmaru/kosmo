import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';
import type { encodeGlobalId as EncodeGlobalId } from '../../../src/graphql/global-id';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
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
      ProfileFollows,
      Profiles,
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
});

type NotificationNode = {
  __typename: string;
  createdAt: string;
  id: string;
  readAt: string | null;
  profile: { id: string };
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
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db
    .delete(Instances)
    .where(and(eq(Instances.kind, InstanceKind.LOCAL), ne(Instances.id, localInstanceId)));
};

const truncateDatabase = async () => {
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/kosmo_test');
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
