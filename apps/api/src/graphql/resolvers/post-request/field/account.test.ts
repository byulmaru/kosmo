import assert from 'node:assert/strict';
import test from 'node:test';
import { PostVisibility } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_STATE_QUERY,
  PostRequestStatus,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { graphql, GraphQLObjectType, GraphQLSchema, isObjectType } from 'graphql';
import { schema } from '@/graphql/schema';
import type {
  PostRequestState,
  PostRequestStatus as PostRequestStatusValue,
} from '@kosmo/core/temporal/post-request';

const ownerAccountId = '00000000-0000-4000-8000-000000000001';
const otherAccountId = '00000000-0000-4000-8000-000000000002';
const profileId = '00000000-0000-4000-8000-000000000003';
const otherProfileId = '00000000-0000-4000-8000-000000000004';

const requestState = (
  requestId: string,
  {
    accountId = ownerAccountId,
    profileId: requestProfileId = profileId,
    status = PostRequestStatus.QUEUED,
  }: {
    readonly accountId?: string;
    readonly profileId?: string;
    readonly status?: PostRequestStatusValue;
  } = {},
): PostRequestState => ({
  snapshot: {
    input: {
      accountId,
      bodyText: `draft ${requestId}`,
      origin: 'LOCAL',
      profileId: requestProfileId,
      visibility: PostVisibility.UNLISTED,
    },
    mediaProcessing: [],
    postId: '00000000-0000-4000-8000-000000000005',
    requestId,
    submittedAt: '2026-10-29T00:00:00.000Z',
  },
  status,
});

const accountQuerySchema = () => {
  const account = schema.getType('Account');
  assert.ok(isObjectType(account));

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'PostRequestAccountTestQuery',
      fields: {
        account: {
          type: account,
          resolve: () => ({ id: ownerAccountId }),
        },
      },
    }),
  });
};

const accountContext = (accountId: string | null) =>
  accountId === null
    ? {}
    : {
        session: {
          id: 'test-session',
          accountId,
          profile: null,
        },
      };

const execution = (workflowId: string) => ({
  execution: { workflowId },
});

test('Account.postRequests paginates one execution per request and filters current statuses', async (t) => {
  const requestA = '00000000-0000-4000-8000-000000000010';
  const requestB = '00000000-0000-4000-8000-000000000011';
  const requestC = '00000000-0000-4000-8000-000000000012';
  const requestD = '00000000-0000-4000-8000-000000000013';
  const workflowA = postRequestWorkflowId(ownerAccountId, requestA);
  const workflowB = postRequestWorkflowId(ownerAccountId, requestB);
  const workflowC = postRequestWorkflowId(ownerAccountId, requestC);
  const workflowD = postRequestWorkflowId(ownerAccountId, requestD);
  const statesByWorkflowId = new Map<string, PostRequestState>([
    [workflowA, requestState(requestA)],
    [workflowB, requestState(requestB, { status: PostRequestStatus.FAILED })],
    [workflowC, requestState(requestC, { status: PostRequestStatus.PUBLISHED })],
    [workflowD, requestState(requestD, { status: PostRequestStatus.FAILED })],
  ]);
  const nativePageToken = Buffer.from('page-2');
  const listRequests: Array<{ query?: string; nextPageToken?: Uint8Array }> = [];
  const list = t.mock.method(
    temporalClient.workflowService,
    'listWorkflowExecutions',
    async (request: unknown) => {
      const listRequest = request as { query?: string; nextPageToken?: Uint8Array };
      listRequests.push(listRequest);
      const token = Buffer.from(listRequest.nextPageToken ?? []).toString('utf8');
      return (
        token === 'page-2'
          ? {
              executions: [execution(workflowC), execution(workflowD)],
              nextPageToken: new Uint8Array(),
            }
          : {
              executions: [execution(workflowA), execution(workflowB)],
              nextPageToken: nativePageToken,
            }
      ) as never;
    },
  );
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        return statesByWorkflowId.get(workflowId) ?? null;
      },
    } as never;
  });

  const execute = async (after?: string) =>
    graphql({
      schema: accountQuerySchema(),
      source: `
        query PostRequests($profileId: ID!, $first: Int!, $after: String, $statuses: [PostRequestStatus!]) {
          account {
            postRequests(profileId: $profileId, first: $first, after: $after, statuses: $statuses) {
              edges { cursor node { id requestId status } }
              pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
            }
          }
        }
      `,
      variableValues: {
        profileId: encodeGlobalId('Profile', profileId),
        first: 1,
        after,
        statuses: [PostRequestStatus.QUEUED, PostRequestStatus.FAILED],
      },
      contextValue: accountContext(ownerAccountId),
    });

  const firstPage = await execute();
  assert.deepEqual(firstPage.errors, undefined);
  const firstConnection = (
    firstPage.data?.account as {
      postRequests: {
        edges: { cursor: string; node: { id: string; requestId: string; status: string } }[];
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
      };
    }
  ).postRequests;
  assert.deepEqual(
    firstConnection.edges.map(({ node }) => [node.requestId, node.status]),
    [[requestA, PostRequestStatus.QUEUED]],
  );
  assert.equal(firstConnection.pageInfo.hasNextPage, true);
  assert.equal(firstConnection.pageInfo.hasPreviousPage, false);

  const secondPage = await execute(firstConnection.edges[0]!.cursor);
  assert.deepEqual(secondPage.errors, undefined);
  const secondConnection = (
    secondPage.data?.account as {
      postRequests: {
        edges: { cursor: string; node: { requestId: string; status: string } }[];
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
      };
    }
  ).postRequests;
  assert.deepEqual(
    secondConnection.edges.map(({ node }) => [node.requestId, node.status]),
    [[requestB, PostRequestStatus.FAILED]],
  );
  assert.equal(secondConnection.pageInfo.hasNextPage, true);
  assert.equal(secondConnection.pageInfo.hasPreviousPage, true);

  const thirdPage = await execute(secondConnection.edges[0]!.cursor);
  assert.deepEqual(thirdPage.errors, undefined);
  const thirdConnection = (
    thirdPage.data?.account as {
      postRequests: {
        edges: { node: { requestId: string; status: string } }[];
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
      };
    }
  ).postRequests;
  assert.deepEqual(
    thirdConnection.edges.map(({ node }) => [node.requestId, node.status]),
    [[requestD, PostRequestStatus.FAILED]],
  );
  assert.equal(thirdConnection.pageInfo.hasNextPage, false);
  assert.equal(thirdConnection.pageInfo.hasPreviousPage, true);
  assert.equal(list.mock.callCount(), 4);
  assert.ok(
    listRequests.every(
      ({ query }) =>
        query !== undefined &&
        query.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId} = '${ownerAccountId}'`) &&
        query.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.profileId} = '${profileId}'`) &&
        query.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.status} IN ('QUEUED', 'FAILED')`),
    ),
  );
});

test('Account.postRequests caps first at the existing 20-item connection maximum', async (t) => {
  const requestIds = Array.from(
    { length: 21 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
  );
  const statesByWorkflowId = new Map<string, PostRequestState>(
    requestIds.map(
      (requestId) =>
        [postRequestWorkflowId(ownerAccountId, requestId), requestState(requestId)] as const,
    ),
  );
  const list = t.mock.method(
    temporalClient.workflowService,
    'listWorkflowExecutions',
    async () =>
      ({
        executions: requestIds.map((requestId) =>
          execution(postRequestWorkflowId(ownerAccountId, requestId)),
        ),
        nextPageToken: new Uint8Array(),
      }) as never,
  );
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        query: async (queryName: string) => {
          assert.equal(queryName, POST_REQUEST_STATE_QUERY);
          return statesByWorkflowId.get(workflowId) ?? null;
        },
      }) as never,
  );

  const result = await graphql({
    schema: accountQuerySchema(),
    source: `
      query PostRequests($profileId: ID!, $first: Int!) {
        account {
          postRequests(profileId: $profileId, first: $first) {
            edges { node { requestId } }
            pageInfo { hasNextPage }
          }
        }
      }
    `,
    variableValues: { profileId: encodeGlobalId('Profile', profileId), first: 100 },
    contextValue: accountContext(ownerAccountId),
  });

  assert.deepEqual(result.errors, undefined);
  const connection = (
    result.data?.account as {
      postRequests: {
        edges: { node: { requestId: string } }[];
        pageInfo: { hasNextPage: boolean };
      };
    }
  ).postRequests;
  assert.equal(connection.edges.length, 20);
  assert.equal(connection.pageInfo.hasNextPage, true);
  assert.equal(list.mock.callCount(), 1);
});

test('Account.postRequest returns an owner snapshot after profile context is gone and filters profile mismatch', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000020';
  const state = requestState(requestId);
  const queryCalls: string[] = [];
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        query: async (queryName: string) => {
          assert.equal(workflowId, postRequestWorkflowId(ownerAccountId, requestId));
          queryCalls.push(queryName);
          return state;
        },
      }) as never,
  );
  const testSchema = accountQuerySchema();
  const source = `
    query PostRequest($requestId: String!, $profileId: ID!) {
      account {
        postRequest(requestId: $requestId, profileId: $profileId) {
          id requestId status draft { bodyText replyParentId repostSourceId }
        }
      }
    }
  `;
  const variables = {
    requestId,
    profileId: encodeGlobalId('Profile', profileId),
  };
  const ownerResult = await graphql({
    schema: testSchema,
    source,
    variableValues: variables,
    contextValue: accountContext(ownerAccountId),
  });

  assert.deepEqual(ownerResult.errors, undefined);
  const ownerRequest = (
    ownerResult.data?.account as {
      postRequest: {
        id: string;
        requestId: string;
        status: string;
        draft: { bodyText: string; replyParentId: string | null; repostSourceId: string | null };
      };
    }
  ).postRequest;
  assert.equal(ownerRequest.id, encodeGlobalId('PostRequest', requestId));
  assert.equal(ownerRequest.requestId, requestId);
  assert.equal(ownerRequest.status, PostRequestStatus.QUEUED);
  assert.equal(ownerRequest.draft.bodyText, `draft ${requestId}`);
  assert.equal(ownerRequest.draft.replyParentId, null);
  assert.equal(ownerRequest.draft.repostSourceId, null);

  const profileMismatch = await graphql({
    schema: testSchema,
    source,
    variableValues: {
      ...variables,
      profileId: encodeGlobalId('Profile', otherProfileId),
    },
    contextValue: accountContext(ownerAccountId),
  });
  assert.deepEqual(profileMismatch.errors, undefined);
  assert.equal((profileMismatch.data?.account as { postRequest: unknown }).postRequest, null);

  const accountMismatch = await graphql({
    schema: testSchema,
    source,
    variableValues: variables,
    contextValue: accountContext(otherAccountId),
  });
  assert.deepEqual(accountMismatch.errors, undefined);
  assert.equal((accountMismatch.data?.account as { postRequest: unknown }).postRequest, null);
  assert.deepEqual(queryCalls, [POST_REQUEST_STATE_QUERY, POST_REQUEST_STATE_QUERY]);
});

test('Account.postRequests denies unauthenticated and non-owner reads before listing workflows', async (t) => {
  const list = t.mock.method(
    temporalClient.workflowService,
    'listWorkflowExecutions',
    async () => ({ executions: [], nextPageToken: new Uint8Array() }) as never,
  );
  const execute = (accountId: string | null) =>
    graphql({
      schema: accountQuerySchema(),
      source: `
        query PostRequests($profileId: ID!, $first: Int!) {
          account {
            postRequests(profileId: $profileId, first: $first) { edges { node { id } } }
          }
        }
      `,
      variableValues: { profileId: encodeGlobalId('Profile', profileId), first: 10 },
      contextValue: accountContext(accountId),
    });

  const unauthenticatedResult = await execute(null);
  assert.ok(unauthenticatedResult.errors?.[0]?.originalError instanceof PermissionDeniedError);
  assert.equal(unauthenticatedResult.data?.account, null);

  const nonOwnerResult = await execute(otherAccountId);
  assert.ok(nonOwnerResult.errors?.[0]?.originalError instanceof PermissionDeniedError);
  assert.equal(nonOwnerResult.data?.account, null);
  assert.equal(list.mock.callCount(), 0);
});

test('PostRequest Node returns null silently for missing, non-owner, and unauthenticated loads', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000030';
  const missingRequestId = '00000000-0000-4000-8000-000000000031';
  const state = requestState(requestId);
  const ownerWorkflowId = postRequestWorkflowId(ownerAccountId, requestId);
  const workflowIds: string[] = [];
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    workflowIds.push(workflowId);
    return {
      query: async () => (workflowId === ownerWorkflowId ? state : null),
    } as never;
  });
  const execute = (nodeId: string, accountId: string | null) =>
    graphql({
      schema,
      source: `
        query PostRequestNode($id: ID!) {
          node(id: $id) { ... on PostRequest { id requestId } }
        }
      `,
      variableValues: { id: encodeGlobalId('PostRequest', nodeId) },
      contextValue: accountContext(accountId),
    });

  const ownerResult = await execute(requestId, ownerAccountId);
  assert.deepEqual(ownerResult.errors, undefined);
  assert.deepEqual(ownerResult.data?.node, {
    id: encodeGlobalId('PostRequest', requestId),
    requestId,
  });

  const missingResult = await execute(missingRequestId, ownerAccountId);
  assert.deepEqual(missingResult.errors, undefined);
  assert.equal(missingResult.data?.node, null);

  const nonOwnerResult = await execute(requestId, otherAccountId);
  assert.deepEqual(nonOwnerResult.errors, undefined);
  assert.equal(nonOwnerResult.data?.node, null);

  const unauthenticatedResult = await execute(requestId, null);
  assert.deepEqual(unauthenticatedResult.errors, undefined);
  assert.equal(unauthenticatedResult.data?.node, null);
  assert.deepEqual(workflowIds, [
    ownerWorkflowId,
    postRequestWorkflowId(ownerAccountId, missingRequestId),
    postRequestWorkflowId(otherAccountId, requestId),
  ]);
});

test('PostRequest Node query propagates Temporal state query failures', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000030';
  const queryFailure = new Error('Temporal query unavailable');
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        query: async (queryName: string) => {
          assert.equal(queryName, POST_REQUEST_STATE_QUERY);
          throw queryFailure;
        },
      }) as never,
  );
  const result = await graphql({
    schema,
    source: `
      query PostRequestNode($id: ID!) {
        node(id: $id) { ... on PostRequest { id requestId status } }
      }
    `,
    variableValues: { id: encodeGlobalId('PostRequest', requestId) },
    contextValue: accountContext(ownerAccountId),
  });

  assert.equal(result.errors?.[0]?.originalError, queryFailure);
});
