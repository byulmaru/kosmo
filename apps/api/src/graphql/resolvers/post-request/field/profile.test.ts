import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountProfiles, db, Profiles } from '@kosmo/core/db';
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

const retainedStatuses = [
  PostRequestStatus.QUEUED,
  PostRequestStatus.PROCESSING,
  PostRequestStatus.PUBLISHING,
  PostRequestStatus.CONFIRMING,
  PostRequestStatus.FAILED,
  PostRequestStatus.CANCELLED,
] as const;

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

type ProfileRow = { readonly id: string };
type ProfileSelectChain = {
  from: (...args: unknown[]) => ProfileSelectChain;
  innerJoin: (...args: unknown[]) => ProfileSelectChain;
  where: (...args: unknown[]) => Promise<ProfileRow[]>;
};

const profileSelectChain = (rows: ProfileRow[]): ProfileSelectChain => {
  let selectedRows: ProfileRow[] = [];
  const chain: ProfileSelectChain = {
    from: (table) => {
      selectedRows = table === Profiles ? rows : table === AccountProfiles ? [] : rows;
      return chain;
    },
    innerJoin: () => chain,
    where: async () => selectedRows,
  };
  return chain;
};

const profilePostRequests = (accountId: string | null = ownerAccountId) =>
  graphql({
    schema,
    source: `
      query ProfilePostRequests($id: ID!) {
        node(id: $id) {
          ... on Profile {
            postRequests {
              requestId
              status
            }
          }
        }
      }
    `,
    variableValues: { id: encodeGlobalId('Profile', profileId) },
    contextValue: accountContext(accountId),
  });

const execution = (workflowId: string) => ({ workflowId });

test('Profile.postRequests keeps live non-published states across pages without requiring membership', async (t) => {
  const matchingRequestIds = Array.from(
    { length: 25 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
  const publishedRequestId = '00000000-0000-4000-8000-000000000101';
  const wrongAccountRequestId = '00000000-0000-4000-8000-000000000102';
  const wrongProfileRequestId = '00000000-0000-4000-8000-000000000103';
  const missingRequestId = '00000000-0000-4000-8000-000000000104';
  const statesByWorkflowId = new Map<string, PostRequestState>([
    ...matchingRequestIds.map(
      (requestId, index) =>
        [
          postRequestWorkflowId(ownerAccountId, requestId),
          requestState(requestId, { status: retainedStatuses[index % retainedStatuses.length] }),
        ] as const,
    ),
    [
      postRequestWorkflowId(ownerAccountId, publishedRequestId),
      requestState(publishedRequestId, { status: PostRequestStatus.PUBLISHED }),
    ],
    [
      postRequestWorkflowId(ownerAccountId, wrongAccountRequestId),
      requestState(wrongAccountRequestId, { accountId: otherAccountId }),
    ],
    [
      postRequestWorkflowId(ownerAccountId, wrongProfileRequestId),
      requestState(wrongProfileRequestId, { profileId: otherProfileId }),
    ],
  ]);
  const foreignAccountWorkflowId = postRequestWorkflowId(otherAccountId, missingRequestId);
  const emptyRequestWorkflowId = postRequestWorkflowId(ownerAccountId, '');
  const listQueries: (string | undefined)[] = [];
  const sdkPages = [
    [
      ...matchingRequestIds
        .slice(0, 20)
        .map((id) => execution(postRequestWorkflowId(ownerAccountId, id))),
      execution(postRequestWorkflowId(ownerAccountId, publishedRequestId)),
    ],
    [
      ...matchingRequestIds
        .slice(20)
        .map((id) => execution(postRequestWorkflowId(ownerAccountId, id))),
      execution(postRequestWorkflowId(ownerAccountId, wrongAccountRequestId)),
      execution(postRequestWorkflowId(ownerAccountId, wrongProfileRequestId)),
      execution(postRequestWorkflowId(ownerAccountId, missingRequestId)),
      execution(foreignAccountWorkflowId),
      execution(emptyRequestWorkflowId),
      execution('unrelated-workflow'),
    ],
  ];

  t.mock.method(db, 'select', () => profileSelectChain([{ id: profileId }]) as never);
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

  const result = await profilePostRequests();
  assert.deepEqual(result.errors, undefined);
  const requests = (result.data?.node as { postRequests: { requestId: string; status: string }[] })
    .postRequests;
  assert.deepEqual(
    requests.map(({ requestId, status }) => [requestId, status]),
    matchingRequestIds.map((requestId, index) => [
      requestId,
      retainedStatuses[index % retainedStatuses.length],
    ]),
  );
  assert.deepEqual(new Set(requests.map(({ status }) => status)), new Set(retainedStatuses));
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
  assert.equal(listQueries[0]?.includes(POST_REQUEST_SEARCH_ATTRIBUTES.status), false);
  assert.equal(workflowIds.includes(foreignAccountWorkflowId), false);
  assert.equal(workflowIds.includes(emptyRequestWorkflowId), false);
  assert.equal(workflowIds.includes('unrelated-workflow'), false);
});

test('Profile.postRequests requires login and does not query Temporal for unauthenticated users', async (t) => {
  t.mock.method(db, 'select', () => profileSelectChain([{ id: profileId }]) as never);
  const list = t.mock.method(temporalClient.workflow, 'list');

  const result = await profilePostRequests(null);
  assert.ok(result.errors?.[0]?.originalError instanceof PermissionDeniedError);
  assert.equal(list.mock.callCount(), 0);
});

test('Profile.postRequests propagates Temporal list errors', async (t) => {
  const failure = new Error('Temporal list failed');
  t.mock.method(db, 'select', () => profileSelectChain([{ id: profileId }]) as never);
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

  const result = await profilePostRequests();
  assert.equal(result.errors?.[0]?.originalError, failure);
});
