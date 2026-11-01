import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionDeniedError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_STATE_QUERY,
  POST_REQUEST_WORKFLOW_TYPE,
  PostRequestStatus,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { graphql } from 'graphql';
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
      media: [],
      mentions: [],
      origin: 'LOCAL',
      profileId: requestProfileId,
      sensitiveMedia: false,
      visibility: 'UNLISTED',
    },
    requestId,
    submittedAt: '2026-10-29T00:00:00.000Z',
  },
  status,
});

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

const execution = (workflowId: string) => ({ workflowId });

const listRequests = (profile: string, statuses?: readonly PostRequestStatusValue[]) =>
  graphql({
    schema,
    source: `
      query PostRequests($profileId: ID!, $statuses: [PostRequestStatus!]) {
        postRequests(profileId: $profileId, statuses: $statuses) {
          requestId
          status
        }
      }
    `,
    variableValues: {
      profileId: encodeGlobalId('Profile', profile),
      statuses,
    },
    contextValue: accountContext(ownerAccountId),
  });

test('postRequests returns all matching states across SDK list pages and revalidates snapshots', async (t) => {
  const matchingRequestIds = Array.from(
    { length: 25 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
  const staleRequestId = '00000000-0000-4000-8000-000000000101';
  const foreignRequestId = '00000000-0000-4000-8000-000000000102';
  const wrongProfileRequestId = '00000000-0000-4000-8000-000000000103';
  const missingRequestId = '00000000-0000-4000-8000-000000000104';
  const statesByWorkflowId = new Map<string, PostRequestState>([
    ...matchingRequestIds.map(
      (requestId, index) =>
        [
          postRequestWorkflowId(ownerAccountId, requestId),
          requestState(requestId, {
            status: index % 2 === 0 ? PostRequestStatus.QUEUED : PostRequestStatus.FAILED,
          }),
        ] as const,
    ),
    [
      postRequestWorkflowId(ownerAccountId, staleRequestId),
      requestState(staleRequestId, { status: PostRequestStatus.PUBLISHED }),
    ],
    [
      postRequestWorkflowId(ownerAccountId, foreignRequestId),
      requestState(foreignRequestId, { accountId: otherAccountId }),
    ],
    [
      postRequestWorkflowId(ownerAccountId, wrongProfileRequestId),
      requestState(wrongProfileRequestId, { profileId: otherProfileId }),
    ],
  ]);
  const listQueries: (string | undefined)[] = [];
  const sdkPages = [
    [
      ...matchingRequestIds
        .slice(0, 20)
        .map((id) => execution(postRequestWorkflowId(ownerAccountId, id))),
      execution(postRequestWorkflowId(ownerAccountId, staleRequestId)),
    ],
    [
      ...matchingRequestIds
        .slice(20)
        .map((id) => execution(postRequestWorkflowId(ownerAccountId, id))),
      execution(postRequestWorkflowId(ownerAccountId, foreignRequestId)),
      execution(postRequestWorkflowId(ownerAccountId, wrongProfileRequestId)),
      execution(postRequestWorkflowId(ownerAccountId, missingRequestId)),
      execution('unrelated-workflow'),
    ],
  ];

  t.mock.method(
    temporalClient.workflow,
    'list',
    (options: Parameters<typeof temporalClient.workflow.list>[0]) => {
      listQueries.push(options?.query);
      return {
        async *[Symbol.asyncIterator]() {
          for (const page of sdkPages) {
            yield* page;
          }
        },
      } as never;
    },
  );
  const workflowIds: string[] = [];
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    workflowIds.push(workflowId);
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        return statesByWorkflowId.get(workflowId) ?? null;
      },
    } as never;
  });

  const result = await listRequests(profileId, [
    PostRequestStatus.QUEUED,
    PostRequestStatus.FAILED,
  ]);
  assert.deepEqual(result.errors, undefined);
  assert.deepEqual(
    (result.data?.postRequests as { requestId: string; status: string }[]).map(
      ({ requestId, status }) => [requestId, status],
    ),
    matchingRequestIds.map((requestId, index) => [
      requestId,
      index % 2 === 0 ? PostRequestStatus.QUEUED : PostRequestStatus.FAILED,
    ]),
  );
  assert.equal(listQueries.length, 1);
  assert.ok(listQueries[0]?.includes(`WorkflowType = '${POST_REQUEST_WORKFLOW_TYPE}'`));
  assert.ok(
    listQueries[0]?.includes(
      `${POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId} = '${ownerAccountId}'`,
    ),
  );
  assert.ok(
    listQueries[0]?.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.profileId} = '${profileId}'`),
  );
  assert.ok(
    listQueries[0]?.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.status} IN ('QUEUED', 'FAILED')`),
  );
  assert.equal(workflowIds.includes('unrelated-workflow'), false);
});

test('postRequests returns empty results for an empty status list without querying Temporal', async (t) => {
  const list = t.mock.method(temporalClient.workflow, 'list');
  const result = await listRequests(profileId, []);
  assert.deepEqual(result.errors, undefined);
  assert.deepEqual(result.data?.postRequests, []);
  assert.equal(list.mock.callCount(), 0);
});

test('postRequests requires an authenticated account', async (t) => {
  const list = t.mock.method(temporalClient.workflow, 'list');
  const unauthenticated = await graphql({
    schema,
    source: `
      query PostRequests($profileId: ID!) {
        postRequests(profileId: $profileId) { requestId }
      }
    `,
    variableValues: { profileId: encodeGlobalId('Profile', profileId) },
    contextValue: accountContext(null),
  });
  assert.ok(unauthenticated.errors?.[0]?.originalError instanceof PermissionDeniedError);
  assert.equal(list.mock.callCount(), 0);
});

test('postRequests propagates Temporal list errors', async (t) => {
  const failure = new Error('Temporal list failed');
  t.mock.method(
    temporalClient.workflow,
    'list',
    () =>
      ({
        async *[Symbol.asyncIterator]() {
          yield* [];
          throw failure;
        },
      }) as never,
  );

  const result = await listRequests(profileId);
  assert.equal(result.errors?.[0]?.originalError, failure);
});
