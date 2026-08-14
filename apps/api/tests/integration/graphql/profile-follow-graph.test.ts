import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { decodeGlobalId, encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, asc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const remoteDomain = 'remote.example';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;
const previousOperationDatabaseUrl = process.env.OPERATION_DATABASE_URL;

// Keep fixture setup on the owner connection while every GraphQL operation is
// opened under the non-owner runtime principal. PostgreSQL applies this startup
// option before the operation-session plugin sets the actor context.
const operationDatabaseUrl = new URL(databaseUrl);
operationDatabaseUrl.searchParams.set('options', '-c role=kosmo_api');
process.env.OPERATION_DATABASE_URL = operationDatabaseUrl.toString();

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL profile follow graph', () => {
  before(async () => {
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
      ProfileFollowRequests,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    ({ yoga } = await import('../../../src/graphql'));

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
    if (previousOperationDatabaseUrl === undefined) {
      delete process.env.OPERATION_DATABASE_URL;
    } else {
      process.env.OPERATION_DATABASE_URL = previousOperationDatabaseUrl;
    }
  });

  test('reads established relationships for an active profile on another local instance', async () => {
    const auth = await createAuthenticatedSession();
    const otherLocalInstance = await createLocalInstance({ domain: 'other-local.example' });
    const otherLocal = await createProfile({
      handle: 'other-local',
      instanceId: otherLocalInstance.id,
    });

    await db.insert(ProfileFollows).values([
      { followerProfileId: auth.profile.id, followeeProfileId: otherLocal.id },
      { followerProfileId: otherLocal.id, followeeProfileId: auth.profile.id },
    ]);

    const result = await requestNodeFollowGraph(otherLocal.id, auth.token);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.followers.edges.length, 1);
    assert.equal(result.data?.node?.following.edges.length, 1);
    assert.deepEqual(result.data?.node?.viewerState, {
      follow: { id: result.data?.node?.followers.edges[0]!.node.id },
      followRequest: null,
      isSelf: false,
    });
  });

  test('returns self viewer state without a follow relationship', async () => {
    const auth = await createAuthenticatedSession();

    const result = await requestNodeFollowGraph(auth.profile.id, auth.token);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      followers: { edges: [] },
      following: { edges: [] },
      viewerState: { follow: null, followRequest: null, isSelf: true },
    });
  });

  test('returns the current Account membership role for the queried Profile', async () => {
    const auth = await createAuthenticatedSession();
    const memberProfile = await createProfile({
      handle: 'viewer-membership-member',
      instanceId: localInstanceId,
    });
    const memberMembership = await db
      .insert(AccountProfiles)
      .values({
        accountId: auth.account.id,
        profileId: memberProfile.id,
        role: AccountProfileRole.MEMBER,
      })
      .returning()
      .then(firstOrThrow);

    const owner = await requestViewerMembership(auth.profile.handle, auth.token);
    const member = await requestViewerMembership(memberProfile.handle, auth.token);

    assertNoGraphQLErrors(owner);
    assertNoGraphQLErrors(member);
    assert.deepEqual(owner.data?.profileByHandle?.viewerState?.membership, {
      id: globalId('AccountProfile', auth.membership.id),
      role: 'OWNER',
    });
    assert.deepEqual(member.data?.profileByHandle?.viewerState?.membership, {
      id: globalId('AccountProfile', memberMembership.id),
      role: 'MEMBER',
    });
  });

  test('returns current Account memberships for multiple Profiles', async () => {
    const auth = await createAuthenticatedSession();
    const [memberProfile, ownerProfile] = await Promise.all([
      createProfile({ handle: 'viewer-membership-batch-member', instanceId: localInstanceId }),
      createProfile({ handle: 'viewer-membership-batch-owner', instanceId: localInstanceId }),
    ]);
    const memberships = await db
      .insert(AccountProfiles)
      .values([
        {
          accountId: auth.account.id,
          profileId: memberProfile.id,
          role: AccountProfileRole.MEMBER,
        },
        {
          accountId: auth.account.id,
          profileId: ownerProfile.id,
          role: AccountProfileRole.OWNER,
        },
      ])
      .returning();
    const result = await requestGraphQL<{
      me: {
        profiles: Array<{
          id: string;
          viewerState: { membership: { id: string; role: string } | null } | null;
        }>;
      } | null;
    }>(
      `query ViewerMemberships {
          me {
            profiles {
              id
              viewerState { membership { id role } }
            }
          }
        }`,
      {},
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(
      result.data?.me?.profiles.toSorted((left, right) => left.id.localeCompare(right.id)),
      [
        {
          id: globalId('Profile', auth.profile.id),
          viewerState: {
            membership: { id: globalId('AccountProfile', auth.membership.id), role: 'OWNER' },
          },
        },
        {
          id: globalId('Profile', memberProfile.id),
          viewerState: {
            membership: { id: globalId('AccountProfile', memberships[0]!.id), role: 'MEMBER' },
          },
        },
        {
          id: globalId('Profile', ownerProfile.id),
          viewerState: {
            membership: { id: globalId('AccountProfile', memberships[1]!.id), role: 'OWNER' },
          },
        },
      ].toSorted((left, right) => left.id.localeCompare(right.id)),
    );
  });

  test('does not expose another Account membership for the queried Profile', async () => {
    const viewer = await createAuthenticatedSession();
    const otherAccount = await createAuthenticatedSession();
    const target = await createProfile({
      handle: 'viewer-membership-other-account',
      instanceId: localInstanceId,
    });
    await db.insert(AccountProfiles).values({
      accountId: otherAccount.account.id,
      profileId: target.id,
      role: AccountProfileRole.OWNER,
    });

    const result = await requestViewerMembership(target.handle, viewer.token);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.profileByHandle?.viewerState?.membership, null);
  });

  test('limits direct AccountProfile Node access to the Membership Account or Profile Owner', async () => {
    const owner = await createAuthenticatedSession();
    const member = await createAuthenticatedSession();
    const unrelated = await createAuthenticatedSession();
    const membership = await db
      .insert(AccountProfiles)
      .values({
        accountId: member.account.id,
        profileId: owner.profile.id,
        role: AccountProfileRole.MEMBER,
      })
      .returning()
      .then(firstOrThrow);
    const membershipId = globalId('AccountProfile', membership.id);

    const [asOwner, asMember, asUnrelated, asGuest] = await Promise.all([
      requestAccountProfileNode(membershipId, owner.token),
      requestAccountProfileNode(membershipId, member.token),
      requestAccountProfileNode(membershipId, unrelated.token),
      requestAccountProfileNode(membershipId),
    ]);

    for (const result of [asOwner, asMember, asUnrelated, asGuest]) {
      assertNoGraphQLErrors(result);
    }
    assert.deepEqual(asOwner.data?.node, { id: membershipId, role: 'MEMBER' });
    assert.deepEqual(asMember.data?.node, { id: membershipId, role: 'MEMBER' });
    assert.equal(asUnrelated.data?.node, null);
    assert.equal(asGuest.data?.node, null);
  });

  test('does not treat a Remote Profile OWNER membership as Profile Owner access', async () => {
    const remoteOwner = await createAuthenticatedSession();
    const remoteMember = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance({
      domain: 'account-profile-node.remote.example',
    });
    const remoteProfile = await createProfile({
      handle: 'account-profile-node-remote',
      instanceId: remoteInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: remoteOwner.account.id,
      profileId: remoteProfile.id,
      role: AccountProfileRole.OWNER,
    });
    const membership = await db
      .insert(AccountProfiles)
      .values({
        accountId: remoteMember.account.id,
        profileId: remoteProfile.id,
        role: AccountProfileRole.MEMBER,
      })
      .returning()
      .then(firstOrThrow);
    const membershipId = globalId('AccountProfile', membership.id);

    const [asRemoteOwner, asMembershipAccount] = await Promise.all([
      requestAccountProfileNode(membershipId, remoteOwner.token),
      requestAccountProfileNode(membershipId, remoteMember.token),
    ]);

    assertNoGraphQLErrors(asRemoteOwner);
    assertNoGraphQLErrors(asMembershipAccount);
    assert.equal(asRemoteOwner.data?.node, null);
    assert.deepEqual(asMembershipAccount.data?.node, { id: membershipId, role: 'MEMBER' });
  });

  test('keeps viewer state nullable for guests and sessions without an active Profile', async () => {
    const withoutViewer = await createAuthenticatedSession({ activeProfile: false });

    const guest = await requestViewerMembership(withoutViewer.profile.handle);
    const noActiveProfile = await requestViewerMembership(
      withoutViewer.profile.handle,
      withoutViewer.token,
    );

    assertNoGraphQLErrors(guest);
    assertNoGraphQLErrors(noActiveProfile);
    assert.equal(guest.data?.profileByHandle?.viewerState, null);
    assert.equal(noActiveProfile.data?.profileByHandle?.viewerState, null);
  });

  test('does not expose pending requests as local follow relationships', async () => {
    const auth = await createAuthenticatedSession();
    const otherLocalInstance = await createLocalInstance({ domain: 'pending-local.example' });
    const otherLocal = await createProfile({
      handle: 'pending-local',
      instanceId: otherLocalInstance.id,
    });
    const [outgoingRequest] = await db
      .insert(ProfileFollowRequests)
      .values([
        { followerProfileId: auth.profile.id, followeeProfileId: otherLocal.id },
        { followerProfileId: otherLocal.id, followeeProfileId: auth.profile.id },
      ])
      .returning();

    const result = await requestNodeFollowGraph(otherLocal.id, auth.token);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      followers: { edges: [] },
      following: { edges: [] },
      viewerState: {
        follow: null,
        followRequest: { id: globalId('ProfileFollowRequest', outgoingRequest!.id) },
        isSelf: false,
      },
    });
  });

  test('exposes request nodes only to participants and keeps unavailable counterparts nullable', async () => {
    const followerAuth = await createAuthenticatedSession();
    const followeeAuth = await createAuthenticatedSession();
    const outsiderAuth = await createAuthenticatedSession();
    const request = await db
      .insert(ProfileFollowRequests)
      .values({
        followerProfileId: followerAuth.profile.id,
        followeeProfileId: followeeAuth.profile.id,
      })
      .returning()
      .then(firstOrThrow);

    const readNode = (token?: string) =>
      requestGraphQL<{
        node: {
          followee: { id: string } | null;
          follower: { id: string } | null;
          id: string;
        } | null;
      }>(
        `query ProfileFollowRequestNode($id: ID!) {
          node(id: $id) {
            ... on ProfileFollowRequest { id follower { id } followee { id } }
          }
        }`,
        { id: globalId('ProfileFollowRequest', request.id) },
        token,
      );

    const followerResult = await readNode(followerAuth.token);
    assertNoGraphQLErrors(followerResult);
    assert.deepEqual(followerResult.data?.node, {
      followee: { id: globalId('Profile', followeeAuth.profile.id) },
      follower: { id: globalId('Profile', followerAuth.profile.id) },
      id: globalId('ProfileFollowRequest', request.id),
    });

    for (const token of [outsiderAuth.token, undefined]) {
      const hidden = await readNode(token);
      assertNoGraphQLErrors(hidden);
      assert.equal(hidden.data?.node, null);
    }

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, followeeAuth.profile.id));
    const cleanupResult = await readNode(followerAuth.token);
    assertNoGraphQLErrors(cleanupResult);
    assert.deepEqual(cleanupResult.data?.node, {
      followee: null,
      follower: { id: globalId('Profile', followerAuth.profile.id) },
      id: globalId('ProfileFollowRequest', request.id),
    });
  });

  test('returns only actor-owned request connections with stable forward and backward pagination', async () => {
    const auth = await createAuthenticatedSession();
    const profiles = await Promise.all(
      ['request-a', 'request-b', 'request-c'].map((handle) =>
        createProfile({ handle, instanceId: localInstanceId }),
      ),
    );
    const requests = await db
      .insert(ProfileFollowRequests)
      .values(
        profiles.map((profile) => ({
          followerProfileId: profile.id,
          followeeProfileId: auth.profile.id,
        })),
      )
      .returning();
    const expectedIds = requests
      .map(({ id }) => id)
      .sort()
      .reverse()
      .map((id) => globalId('ProfileFollowRequest', id));

    const firstPage = await requestGraphQL<{
      node: {
        incomingProfileFollowRequests: {
          edges: Array<{ cursor: string; node: { id: string } }>;
          pageInfo: { endCursor: string | null; hasNextPage: boolean };
        } | null;
        outgoingProfileFollowRequests: { edges: unknown[] } | null;
      } | null;
    }>(
      `query IncomingRequests($id: ID!) {
        node(id: $id) {
          ... on Profile {
            incomingProfileFollowRequests(first: 2) {
              edges { cursor node { id } }
              pageInfo { endCursor hasNextPage }
            }
            outgoingProfileFollowRequests(first: 2) { edges { node { id } } }
          }
        }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.node?.incomingProfileFollowRequests?.edges.map(({ node }) => node.id),
      expectedIds.slice(0, 2),
    );
    assert.equal(firstPage.data?.node?.incomingProfileFollowRequests?.pageInfo.hasNextPage, true);
    assert.deepEqual(firstPage.data?.node?.outgoingProfileFollowRequests?.edges, []);

    const endCursor = firstPage.data?.node?.incomingProfileFollowRequests?.pageInfo.endCursor;
    assert.ok(endCursor);
    const secondPage = await requestGraphQL<{
      node: {
        incomingProfileFollowRequests: { edges: Array<{ node: { id: string } }> } | null;
      } | null;
    }>(
      `query IncomingRequestsAfter($id: ID!, $after: String!) {
        node(id: $id) {
          ... on Profile {
            incomingProfileFollowRequests(first: 2, after: $after) { edges { node { id } } }
          }
        }
      }`,
      { after: endCursor, id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.node?.incomingProfileFollowRequests?.edges.map(({ node }) => node.id),
      expectedIds.slice(2),
    );

    const otherProfile = await requestGraphQL<{
      node: {
        incomingProfileFollowRequests: unknown;
        outgoingProfileFollowRequests: unknown;
      } | null;
    }>(
      `query OtherRequestConnections($id: ID!) {
        node(id: $id) {
          ... on Profile {
            incomingProfileFollowRequests(first: 1) { edges { node { id } } }
            outgoingProfileFollowRequests(last: 1) { edges { node { id } } }
          }
        }
      }`,
      { id: globalId('Profile', profiles[0]!.id) },
      auth.token,
    );
    assertNoGraphQLErrors(otherProfile);
    assert.deepEqual(otherProfile.data?.node, {
      incomingProfileFollowRequests: null,
      outgoingProfileFollowRequests: null,
    });

    const backward = await requestGraphQL<{
      node: {
        incomingProfileFollowRequests: { edges: Array<{ node: { id: string } }> } | null;
      } | null;
    }>(
      `query LastIncomingRequest($id: ID!) {
        node(id: $id) {
          ... on Profile {
            incomingProfileFollowRequests(last: 1) { edges { node { id } } }
          }
        }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(backward);
    assert.deepEqual(
      backward.data?.node?.incomingProfileFollowRequests?.edges.map(({ node }) => node.id),
      expectedIds.slice(-1),
    );
  });

  test('isolates a same-account Profile from another selected Profile request', async () => {
    const auth = await createAuthenticatedSession();
    const followeeAuth = await createAuthenticatedSession();
    const otherSelectedProfile = await createProfile({
      handle: 'same-account-other-selected',
      instanceId: localInstanceId,
    });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: otherSelectedProfile.id,
      role: AccountProfileRole.MEMBER,
    });
    const [selectedRequest, otherRequest] = await db
      .insert(ProfileFollowRequests)
      .values([
        {
          followerProfileId: auth.profile.id,
          followeeProfileId: followeeAuth.profile.id,
        },
        {
          followerProfileId: otherSelectedProfile.id,
          followeeProfileId: followeeAuth.profile.id,
        },
      ])
      .returning();

    const selectedNode = await requestProfileFollowRequestNode(selectedRequest!.id, auth.token);
    assertNoGraphQLErrors(selectedNode);
    assert.equal(
      selectedNode.data?.node?.id,
      globalId('ProfileFollowRequest', selectedRequest!.id),
    );

    await db
      .update(Sessions)
      .set({ activeProfileId: otherSelectedProfile.id })
      .where(eq(Sessions.id, auth.session.id));

    const isolatedNode = await requestProfileFollowRequestNode(selectedRequest!.id, auth.token);
    assertNoGraphQLErrors(isolatedNode);
    assert.equal(isolatedNode.data?.node, null);

    const selectedProfileConnections = await requestGraphQL<{
      node: {
        incomingProfileFollowRequests: unknown;
        outgoingProfileFollowRequests: unknown;
      } | null;
    }>(
      `query OriginalProfileRequestConnections($id: ID!) {
        node(id: $id) {
          ... on Profile {
            incomingProfileFollowRequests(first: 10) { edges { node { id } } }
            outgoingProfileFollowRequests(first: 10) { edges { node { id } } }
          }
        }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(selectedProfileConnections);
    assert.deepEqual(selectedProfileConnections.data?.node, {
      incomingProfileFollowRequests: null,
      outgoingProfileFollowRequests: null,
    });

    const otherProfileConnections = await requestGraphQL<{
      node: {
        outgoingProfileFollowRequests: { edges: Array<{ node: { id: string } }> } | null;
      } | null;
    }>(
      `query OtherSelectedProfileRequestConnections($id: ID!) {
        node(id: $id) {
          ... on Profile {
            outgoingProfileFollowRequests(first: 10) { edges { node { id } } }
          }
        }
      }`,
      { id: globalId('Profile', otherSelectedProfile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(otherProfileConnections);
    assert.deepEqual(
      otherProfileConnections.data?.node?.outgoingProfileFollowRequests?.edges.map(
        ({ node }) => node.id,
      ),
      [globalId('ProfileFollowRequest', otherRequest!.id)],
    );
  });

  test('fails closed for missing, empty and malformed selected Profile context', async () => {
    const auth = await createAuthenticatedSession();
    const followeeAuth = await createAuthenticatedSession();
    const request = await db
      .insert(ProfileFollowRequests)
      .values({
        followerProfileId: auth.profile.id,
        followeeProfileId: followeeAuth.profile.id,
      })
      .returning()
      .then(firstOrThrow);
    const id = globalId('ProfileFollowRequest', request.id);
    const query = `query HiddenProfileFollowRequest($id: ID!) {
      node(id: $id) {
        ... on ProfileFollowRequest { id }
      }
    }`;

    const guest = await requestGraphQL<{ node: { id: string } | null }>(query, { id });
    assertNoGraphQLErrors(guest);
    assert.equal(guest.data?.node, null);

    const withoutSelectedProfile = await requestGraphQLWithSession(
      query,
      { id },
      { ...auth.session, profileId: null },
    );
    assertNoGraphQLErrors(withoutSelectedProfile);
    assert.equal(withoutSelectedProfile.data?.node, null);

    const malformedSelectedProfile = await requestGraphQLWithSession(
      query,
      { id },
      { ...auth.session, profileId: 'not-a-uuid' },
    );
    assertNoGraphQLErrors(malformedSelectedProfile);
    assert.equal(malformedSelectedProfile.data?.node, null);
  });

  test('preserves follower/followee command direction and approval Notification effects', async () => {
    const followerAuth = await createAuthenticatedSession();
    const followeeAuth = await createAuthenticatedSession();
    const outsiderAuth = await createAuthenticatedSession();
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(eq(Profiles.id, followeeAuth.profile.id));

    const requested = await requestGraphQL<{
      followProfile: {
        followeeProfile: { followersCount: number; id: string };
        followerProfile: { followingCount: number; id: string };
        result: { __typename: string; id: string };
      };
    }>(
      `mutation CreateApprovalRequiredFollow($id: ID!) {
        followProfile(input: { id: $id }) {
          followeeProfile { followersCount id }
          followerProfile { followingCount id }
          result { __typename ... on ProfileFollowRequest { id } }
        }
      }`,
      { id: globalId('Profile', followeeAuth.profile.id) },
      followerAuth.token,
    );
    assertNoGraphQLErrors(requested);
    assert.deepEqual(requested.data?.followProfile, {
      followeeProfile: {
        followersCount: 0,
        id: globalId('Profile', followeeAuth.profile.id),
      },
      followerProfile: {
        followingCount: 0,
        id: globalId('Profile', followerAuth.profile.id),
      },
      result: {
        __typename: 'ProfileFollowRequest',
        id: requested.data?.followProfile.result.id,
      },
    });
    const requestId = requested.data!.followProfile.result.id;
    assert.equal(await db.$count(ProfileFollowRequests), 1);
    assert.equal(await db.$count(ProfileFollows), 0);
    assert.equal(
      await db.$count(
        Notifications,
        and(
          eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
          eq(Notifications.sourceId, decodeGlobalId(requestId).id),
        ),
      ),
      1,
    );
    assert.deepEqual(
      await requestProfileNotificationKinds(followeeAuth.profile.id, followeeAuth.token),
      [
        {
          kind: 'FollowRequestNotification',
          profileId: globalId('Profile', followerAuth.profile.id),
        },
      ],
    );

    const sameAccountOtherProfile = await createProfile({
      handle: 'approval-other-selected',
      instanceId: localInstanceId,
    });
    await db.insert(AccountProfiles).values({
      accountId: followerAuth.account.id,
      profileId: sameAccountOtherProfile.id,
      role: AccountProfileRole.MEMBER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: sameAccountOtherProfile.id })
      .where(eq(Sessions.id, followerAuth.session.id));
    const otherSelectedApproval = await requestGraphQL(
      `mutation OtherSelectedApprove($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: requestId },
      followerAuth.token,
    );
    assertGraphQLErrorCode(otherSelectedApproval, 'NOT_FOUND');
    await db
      .update(Sessions)
      .set({ activeProfileId: followerAuth.profile.id })
      .where(eq(Sessions.id, followerAuth.session.id));

    const wrongRoleApproval = await requestGraphQL(
      `mutation FollowerApprove($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: requestId },
      followerAuth.token,
    );
    assertGraphQLErrorCode(wrongRoleApproval, 'PERMISSION_DENIED');
    const wrongRoleCancel = await requestGraphQL(
      `mutation FolloweeCancel($id: ID!) {
        cancelProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: requestId },
      followeeAuth.token,
    );
    assertGraphQLErrorCode(wrongRoleCancel, 'PERMISSION_DENIED');
    assert.equal(await db.$count(ProfileFollowRequests), 1);

    const outsiderApproval = await requestGraphQL(
      `mutation OutsiderApprove($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: requestId },
      outsiderAuth.token,
    );
    assertGraphQLErrorCode(outsiderApproval, 'NOT_FOUND');
    const absentApproval = await requestGraphQL(
      `mutation AbsentApprove($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: globalId('ProfileFollowRequest', crypto.randomUUID()) },
      followeeAuth.token,
    );
    assertGraphQLErrorCode(absentApproval, 'NOT_FOUND');

    const approved = await requestGraphQL<{
      approveProfileFollowRequest: {
        followeeProfile: { followersCount: number; id: string };
        followerProfile: { followingCount: number; id: string };
        profileFollow: { id: string };
        profileFollowRequestId: string;
      };
    }>(
      `mutation ApproveFollow($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) {
          followeeProfile { followersCount id }
          followerProfile { followingCount id }
          profileFollow { id }
          profileFollowRequestId
        }
      }`,
      { id: requestId },
      followeeAuth.token,
    );
    assertNoGraphQLErrors(approved);
    assert.deepEqual(approved.data?.approveProfileFollowRequest, {
      followeeProfile: {
        followersCount: 1,
        id: globalId('Profile', followeeAuth.profile.id),
      },
      followerProfile: {
        followingCount: 1,
        id: globalId('Profile', followerAuth.profile.id),
      },
      profileFollow: { id: approved.data?.approveProfileFollowRequest.profileFollow.id },
      profileFollowRequestId: requestId,
    });
    assert.equal(await db.$count(ProfileFollowRequests), 0);
    assert.equal(await db.$count(ProfileFollows), 1);
    assert.equal(
      await db.$count(
        Notifications,
        and(
          eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
          eq(Notifications.sourceId, decodeGlobalId(requestId).id),
        ),
      ),
      0,
    );
    assert.equal(
      await db.$count(Notifications, eq(Notifications.kind, NotificationKind.FOLLOW)),
      1,
    );
    assert.deepEqual(
      await requestProfileNotificationKinds(followeeAuth.profile.id, followeeAuth.token),
      [{ kind: 'FollowNotification', profileId: globalId('Profile', followerAuth.profile.id) }],
    );

    const repeatedApproval = await requestGraphQL(
      `mutation RepeatedApprove($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: requestId },
      followeeAuth.token,
    );
    assertGraphQLErrorCode(repeatedApproval, 'NOT_FOUND');
    assert.equal(await db.$count(ProfileFollowRequests), 0);
    assert.equal(await db.$count(ProfileFollows), 1);
  });

  test('reject and cancel remove request Notifications without creating relationships', async () => {
    for (const action of ['reject', 'cancel'] as const) {
      const followerAuth = await createAuthenticatedSession();
      const followeeAuth = await createAuthenticatedSession();
      await db
        .update(Profiles)
        .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
        .where(eq(Profiles.id, followeeAuth.profile.id));

      const requested = await requestGraphQL<{
        followProfile: { result: { __typename: string; id: string } };
      }>(
        `mutation CreatePendingFollow($id: ID!) {
          followProfile(input: { id: $id }) {
            result { __typename ... on ProfileFollowRequest { id } }
          }
        }`,
        { id: globalId('Profile', followeeAuth.profile.id) },
        followerAuth.token,
      );
      assertNoGraphQLErrors(requested);
      assert.equal(requested.data?.followProfile.result.__typename, 'ProfileFollowRequest');
      const requestId = requested.data!.followProfile.result.id;
      assert.deepEqual(
        await requestProfileNotificationKinds(followeeAuth.profile.id, followeeAuth.token),
        [
          {
            kind: 'FollowRequestNotification',
            profileId: globalId('Profile', followerAuth.profile.id),
          },
        ],
      );

      const terminal = await requestGraphQL(
        action === 'reject'
          ? `mutation RejectPendingFollow($id: ID!) {
              rejectProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
            }`
          : `mutation CancelPendingFollow($id: ID!) {
              cancelProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
            }`,
        { id: requestId },
        action === 'reject' ? followeeAuth.token : followerAuth.token,
      );
      assertNoGraphQLErrors(terminal);
      assert.equal(await db.$count(ProfileFollowRequests), 0);
      assert.equal(await db.$count(ProfileFollows), 0);
      assert.equal(
        await db.$count(
          Notifications,
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
            eq(Notifications.sourceId, decodeGlobalId(requestId).id),
          ),
        ),
        0,
      );
      assert.deepEqual(
        await requestProfileNotificationKinds(followeeAuth.profile.id, followeeAuth.token),
        [],
      );
    }
  });

  test('reads visible established relationships and stored counts for a remote profile', async () => {
    const remoteInstance = await createRemoteInstance();
    const counterpartInstance = await createRemoteInstance({
      domain: 'unresponsive-counterpart.example',
      state: InstanceState.UNRESPONSIVE,
    });
    const remote = await createProfile({
      followersCount: 41,
      followingCount: 43,
      handle: 'remote-follow-graph',
      instanceId: remoteInstance.id,
    });
    const publicFollower = await createProfile({
      handle: 'public-follower',
      instanceId: counterpartInstance.id,
    });
    const publicFollowee = await createProfile({
      handle: 'public-followee',
      instanceId: counterpartInstance.id,
    });
    const [followerFollow, followingFollow] = await db
      .insert(ProfileFollows)
      .values([
        { followerProfileId: publicFollower.id, followeeProfileId: remote.id },
        { followerProfileId: remote.id, followeeProfileId: publicFollowee.id },
      ])
      .returning();

    const result = await requestFollowGraph(`remote-follow-graph@${remoteDomain}`);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', remote.id) },
              follower: { id: globalId('Profile', publicFollower.id) },
              id: globalId('ProfileFollow', followerFollow!.id),
            },
          },
        ],
      },
      followersCount: 41,
      following: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', publicFollowee.id) },
              follower: { id: globalId('Profile', remote.id) },
              id: globalId('ProfileFollow', followingFollow!.id),
            },
          },
        ],
      },
      followingCount: 43,
      viewerState: null,
    });
  });

  test("shows the viewer's own approval-required relationships", async () => {
    const auth = await createAuthenticatedSession();
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(eq(Profiles.id, auth.profile.id));
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: 'viewer-private-follow-graph',
      instanceId: remoteInstance.id,
    });
    const [viewerFollow, reverseViewerFollow] = await db
      .insert(ProfileFollows)
      .values([
        { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
        { followerProfileId: remote.id, followeeProfileId: auth.profile.id },
      ])
      .returning();

    const result = await requestFollowGraph(
      `viewer-private-follow-graph@${remoteDomain}`,
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', remote.id) },
              follower: { id: globalId('Profile', auth.profile.id) },
              id: globalId('ProfileFollow', viewerFollow!.id),
            },
          },
        ],
      },
      followersCount: 0,
      following: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', auth.profile.id) },
              follower: { id: globalId('Profile', remote.id) },
              id: globalId('ProfileFollow', reverseViewerFollow!.id),
            },
          },
        ],
      },
      followingCount: 0,
      viewerState: {
        follow: { id: globalId('ProfileFollow', viewerFollow!.id) },
        followRequest: null,
        isSelf: false,
      },
    });
  });

  test('excludes approval-required relationships from a remote follow graph', async () => {
    await assertRemoteFollowGraphHidesCounterparts({
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    });
  });

  test('excludes inactive profile relationships from a remote follow graph', async () => {
    await assertRemoteFollowGraphHidesCounterparts({ profileState: ProfileState.DISABLED });
  });

  test('excludes suspended instance relationships from a remote follow graph', async () => {
    await assertRemoteFollowGraphHidesCounterparts({
      instanceState: InstanceState.SUSPENDED,
    });
  });

  test('does not return viewer state follow for a reverse-only relationship', async () => {
    const { result } = await requestViewerFollowScenario('reverse');

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle?.viewerState, {
      follow: null,
      followRequest: null,
      isSelf: false,
    });
  });

  test('returns no viewer state for a session without an active profile', async () => {
    const auth = await createAuthenticatedSession({ activeProfile: false });
    const remoteInstance = await createRemoteInstance();
    await createProfile({
      handle: 'no-active-profile-target',
      instanceId: remoteInstance.id,
    });

    const result = await requestFollowGraph(`no-active-profile-target@${remoteDomain}`, auth.token);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.profileByHandle?.viewerState, null);
  });

  test('exposes only the viewer-to-target pending request without changing the graph', async () => {
    const { outgoingRequest, result } = await requestViewerFollowScenario('pending', {
      followersCount: 47,
      followingCount: 53,
    });

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: { edges: [] },
      followersCount: 47,
      following: { edges: [] },
      followingCount: 53,
      viewerState: {
        follow: null,
        followRequest: { id: globalId('ProfileFollowRequest', outgoingRequest!.id) },
        isSelf: false,
      },
    });
  });

  test('does not expose an incoming pending request as viewer follow state', async () => {
    const { result } = await requestViewerFollowScenario('incoming-pending');

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle?.viewerState, {
      follow: null,
      followRequest: null,
      isSelf: false,
    });
  });

  test('reads a remote follow graph without network or database writes', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      followersCount: 61,
      followingCount: 67,
      handle: 'read-only-remote-follow-graph',
      instanceId: remoteInstance.id,
    });
    const pendingFollower = await createProfile({
      handle: 'pending-follower',
      instanceId: localInstanceId,
    });
    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id });
    await db
      .insert(ProfileFollowRequests)
      .values({ followerProfileId: pendingFollower.id, followeeProfileId: remote.id });

    const readFollowGraphState = async () =>
      JSON.stringify({
        instances: await db.select().from(Instances).orderBy(asc(Instances.id)),
        profiles: await db.select().from(Profiles).orderBy(asc(Profiles.id)),
        follows: await db.select().from(ProfileFollows).orderBy(asc(ProfileFollows.id)),
        requests: await db
          .select()
          .from(ProfileFollowRequests)
          .orderBy(asc(ProfileFollowRequests.id)),
      });
    const stateBefore = await readFollowGraphState();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('Remote follow graph reads must not fetch remote collections.');
    }) as typeof fetch;

    let result: GraphQLResult<FollowGraph>;

    try {
      result = await requestFollowGraph(
        `read-only-remote-follow-graph@${remoteDomain}`,
        auth.token,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assertNoGraphQLErrors(result!);
    assert.ok(result!.data?.profileByHandle?.viewerState?.follow);
    assert.equal(await readFollowGraphState(), stateBefore);
  });
});

type GraphQLErrorResult = {
  extensions?: { code?: string };
  message: string;
};

type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData;
  errors?: GraphQLErrorResult[];
};

type FollowGraphProfile = {
  followers: { edges: Array<{ node: ProfileFollowNode }> };
  followersCount: number;
  following: { edges: Array<{ node: ProfileFollowNode }> };
  followingCount: number;
  viewerState: {
    follow: { id: string } | null;
    followRequest: { id: string } | null;
    isSelf: boolean;
  } | null;
};

type ProfileFollowNode = {
  followee: { id: string } | null;
  follower: { id: string } | null;
  id: string;
};

type FollowGraph = { profileByHandle: FollowGraphProfile | null };

type ViewerMembershipResult = {
  profileByHandle: {
    viewerState: {
      membership: { id: string; role: 'MEMBER' | 'OWNER' } | null;
    } | null;
  } | null;
};

type AccountProfileNodeResult = {
  node: { id: string; role: 'MEMBER' | 'OWNER' } | null;
};

type NodeFollowGraph = {
  node: Omit<FollowGraphProfile, 'followersCount' | 'followingCount'> | null;
};

type ProfileFollowRequestNodeResult = {
  node: { id: string } | null;
};

type ProfileNotification = {
  kind: string;
  profileId: string;
};

type ProfileNotificationsResult = {
  node: {
    notifications: {
      edges: Array<{
        node: {
          __typename: string;
          profile?: { id: string };
        };
      }>;
    };
  } | null;
};

type SessionOverride = {
  id: string;
  accountId: string;
  profileId: string | null;
};

const followGraphFields = `
  followers(first: 10) { edges { node { id follower { id } followee { id } } } }
  following(first: 10) { edges { node { id follower { id } followee { id } } } }
  viewerState { isSelf follow { id } followRequest { id } }
`;

const requestNodeFollowGraph = (id: string, token: string) =>
  requestGraphQL<NodeFollowGraph>(
    `query NodeFollowGraph($id: ID!) {
      node(id: $id) {
        ... on Profile { ${followGraphFields} }
      }
    }`,
    { id: globalId('Profile', id) },
    token,
  );

const requestProfileFollowRequestNode = (id: string, token?: string) =>
  requestGraphQL<ProfileFollowRequestNodeResult>(
    `query ProfileFollowRequestNode($id: ID!) {
      node(id: $id) {
        ... on ProfileFollowRequest { id }
      }
    }`,
    { id: globalId('ProfileFollowRequest', id) },
    token,
  );

const requestProfileNotificationKinds = async (
  profileId: string,
  token: string,
): Promise<ProfileNotification[]> => {
  const result = await requestGraphQL<ProfileNotificationsResult>(
    `query ProfileNotifications($id: ID!) {
      node(id: $id) {
        ... on Profile {
          notifications(first: 10) {
            edges {
              node {
                __typename
                ... on FollowNotification { profile { id } }
                ... on FollowRequestNotification { profile { id } }
              }
            }
          }
        }
      }
    }`,
    { id: globalId('Profile', profileId) },
    token,
  );
  assertNoGraphQLErrors(result);
  return (
    result.data?.node?.notifications.edges.map(({ node }) => ({
      kind: node.__typename,
      profileId: node.profile?.id ?? '',
    })) ?? []
  );
};

const requestFollowGraph = (handle: string, token?: string) =>
  requestGraphQL<FollowGraph>(
    `query FollowGraph($handle: String!) {
      profileByHandle(handle: $handle) {
        ${followGraphFields}
        followersCount
        followingCount
      }
    }`,
    { handle },
    token,
  );

const requestViewerMembership = (handle: string, token?: string) =>
  requestGraphQL<ViewerMembershipResult>(
    `query ViewerMembership($handle: String!) {
      profileByHandle(handle: $handle) {
        viewerState {
          membership { id role }
        }
      }
    }`,
    { handle },
    token,
  );

const requestAccountProfileNode = (id: string, token?: string) =>
  requestGraphQL<AccountProfileNodeResult>(
    `query AccountProfileNode($id: ID!) {
      node(id: $id) {
        ... on AccountProfile { id role }
      }
    }`,
    { id },
    token,
  );

const assertRemoteFollowGraphHidesCounterparts = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  instanceState,
  profileState = ProfileState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  instanceState?: InstanceState;
  profileState?: ProfileState;
}) => {
  const remoteInstance = await createRemoteInstance();
  const remote = await createProfile({
    handle: 'filtered-remote-follow-graph',
    instanceId: remoteInstance.id,
  });
  const counterpartInstanceId = instanceState
    ? await createRemoteInstance({
        domain: 'filtered-counterpart.example',
        state: instanceState,
      }).then((instance) => instance.id)
    : localInstanceId;
  const follower = await createProfile({
    followPolicy,
    handle: 'filtered-follower',
    instanceId: counterpartInstanceId,
    state: profileState,
  });
  const followee = await createProfile({
    followPolicy,
    handle: 'filtered-followee',
    instanceId: counterpartInstanceId,
    state: profileState,
  });
  await db.insert(ProfileFollows).values([
    { followerProfileId: follower.id, followeeProfileId: remote.id },
    { followerProfileId: remote.id, followeeProfileId: followee.id },
  ]);

  const result = await requestFollowGraph(`filtered-remote-follow-graph@${remoteDomain}`);

  assertNoGraphQLErrors(result);
  assert.deepEqual(result.data?.profileByHandle?.followers.edges, []);
  assert.deepEqual(result.data?.profileByHandle?.following.edges, []);
};

const requestViewerFollowScenario = async (
  relation: 'incoming-pending' | 'pending' | 'reverse',
  { followersCount, followingCount }: { followersCount?: number; followingCount?: number } = {},
) => {
  const auth = await createAuthenticatedSession();
  const remoteInstance = await createRemoteInstance();
  const remote = await createProfile({
    followersCount,
    followingCount,
    handle: `viewer-${relation}-remote`,
    instanceId: remoteInstance.id,
  });

  let outgoingRequest: typeof ProfileFollowRequests.$inferSelect | undefined;

  if (relation === 'reverse') {
    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: remote.id, followeeProfileId: auth.profile.id });
  } else if (relation === 'incoming-pending') {
    await db
      .insert(ProfileFollowRequests)
      .values({ followerProfileId: remote.id, followeeProfileId: auth.profile.id });
  } else {
    [outgoingRequest] = await db
      .insert(ProfileFollowRequests)
      .values([
        { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
        { followerProfileId: remote.id, followeeProfileId: auth.profile.id },
      ])
      .returning();
  }

  const result = await requestFollowGraph(`viewer-${relation}-remote@${remoteDomain}`, auth.token);
  return { outgoingRequest, result };
};

const requestGraphQL = async <TData = Record<string, unknown>>(
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

const requestGraphQLWithSession = async <TData = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  session: SessionOverride,
): Promise<GraphQLResult<TData>> => {
  const scopedApp = new Hono<Env>();
  scopedApp.use('*', async (c, next) => {
    const context = await deriveContext(c);
    context.session = session;
    c.set('context', context);
    return next();
  });
  scopedApp.route('/graphql', yoga);

  const response = await scopedApp.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const assertGraphQLErrorCode = (result: GraphQLResult<unknown>, code: string) => {
  assert.equal(result.errors?.[0]?.extensions?.code, code, JSON.stringify(result.errors));
};

const createRemoteInstance = async ({
  domain = remoteDomain,
  state = InstanceState.ACTIVE,
}: {
  domain?: string;
  state?: InstanceState;
} = {}) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createLocalInstance = async ({ domain }: { domain: string }) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createProfile = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  followersCount,
  followingCount,
  handle,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  followersCount?: number;
  followingCount?: number;
  handle: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy,
      ...(followersCount === undefined ? {} : { followersCount }),
      ...(followingCount === undefined ? {} : { followingCount }),
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  activeProfile = true,
}: { activeProfile?: boolean } = {}) => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile({
    handle: `viewer-${crypto.randomUUID().slice(0, 8)}`,
    instanceId: localInstanceId,
  });
  const membership = await db
    .insert(AccountProfiles)
    .values({
      accountId: account.id,
      profileId: profile.id,
      role: AccountProfileRole.OWNER,
    })
    .returning()
    .then(firstOrThrow);
  const token = `token-${crypto.randomUUID()}`;
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

  return { account, membership, profile, session, token };
};

const resetFixtures = async () => {
  await db.delete(Sessions);
  await db.delete(ProfileFollowRequests);
  await db.delete(ProfileFollows);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(eq(Instances.kind, InstanceKind.ACTIVITYPUB));
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
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);
};
