import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_STATE_QUERY,
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

const execution = (workflowId: string) => ({ execution: { workflowId } });

const listRequests = (
  profile: string,
  statuses?: readonly PostRequestStatusValue[],
  pageToken?: string,
) =>
  graphql({
    schema,
    source: `
      query PostRequests($profileId: ID!, $statuses: [PostRequestStatus!], $pageToken: String) {
        postRequests(profileId: $profileId, statuses: $statuses, pageToken: $pageToken) {
          requests { requestId status }
          nextPageToken
        }
      }
    `,
    variableValues: {
      profileId: encodeGlobalId('Profile', profile),
      statuses,
      pageToken,
    },
    contextValue: accountContext(ownerAccountId),
  });

test('postRequests follows native Temporal tokens and filters returned states by owner, profile, and status', async (t) => {
  const requestA = '00000000-0000-4000-8000-000000000010';
  const requestB = '00000000-0000-4000-8000-000000000011';
  const requestC = '00000000-0000-4000-8000-000000000012';
  const requestD = '00000000-0000-4000-8000-000000000013';
  const requestWrongProfile = '00000000-0000-4000-8000-000000000014';
  const workflowA = postRequestWorkflowId(ownerAccountId, requestA);
  const workflowB = postRequestWorkflowId(ownerAccountId, requestB);
  const workflowC = postRequestWorkflowId(ownerAccountId, requestC);
  const workflowD = postRequestWorkflowId(ownerAccountId, requestD);
  const workflowWrongProfile = postRequestWorkflowId(ownerAccountId, requestWrongProfile);
  const statesByWorkflowId = new Map<string, PostRequestState>([
    [workflowA, requestState(requestA)],
    [workflowB, requestState(requestB, { status: PostRequestStatus.FAILED })],
    [workflowC, requestState(requestC, { status: PostRequestStatus.PUBLISHED })],
    [workflowD, requestState(requestD, { status: PostRequestStatus.FAILED })],
    [workflowWrongProfile, requestState(requestWrongProfile, { profileId: otherProfileId })],
  ]);
  const nativePageToken = Buffer.from('native-page-2');
  const listInputs: Array<{ pageSize?: number; query?: string; nextPageToken?: Uint8Array }> = [];
  t.mock.method(
    temporalClient.workflowService,
    'listWorkflowExecutions',
    async (request: unknown) => {
      const listInput = request as (typeof listInputs)[number];
      listInputs.push(listInput);
      const token = Buffer.from(listInput.nextPageToken ?? []).toString('utf8');
      return (
        token === 'native-page-2'
          ? {
              executions: [execution(workflowD)],
              nextPageToken: new Uint8Array(),
            }
          : {
              executions: [
                execution(workflowA),
                execution(workflowB),
                execution(workflowC),
                execution(workflowWrongProfile),
              ],
              nextPageToken: nativePageToken,
            }
      ) as never;
    },
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

  const firstPage = await listRequests(profileId, [
    PostRequestStatus.QUEUED,
    PostRequestStatus.FAILED,
  ]);
  assert.deepEqual(firstPage.errors, undefined);
  const firstValue = firstPage.data?.postRequests as {
    requests: { requestId: string; status: string }[];
    nextPageToken: string | null;
  };
  assert.deepEqual(
    firstValue.requests.map(({ requestId: id, status }) => [id, status]),
    [
      [requestA, PostRequestStatus.QUEUED],
      [requestB, PostRequestStatus.FAILED],
    ],
  );
  assert.equal(firstValue.nextPageToken, nativePageToken.toString('base64url'));

  const secondPage = await listRequests(
    profileId,
    [PostRequestStatus.QUEUED, PostRequestStatus.FAILED],
    firstValue.nextPageToken,
  );
  assert.deepEqual(secondPage.errors, undefined);
  const secondValue = secondPage.data?.postRequests as {
    requests: { requestId: string; status: string }[];
    nextPageToken: string | null;
  };
  assert.deepEqual(
    secondValue.requests.map(({ requestId: id, status }) => [id, status]),
    [[requestD, PostRequestStatus.FAILED]],
  );
  assert.equal(secondValue.nextPageToken, null);
  assert.equal(listInputs.length, 2);
  assert.ok(listInputs.every(({ pageSize }) => pageSize === 20));
  assert.ok(
    listInputs.every(
      ({ query }) =>
        query !== undefined &&
        query.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId} = '${ownerAccountId}'`) &&
        query.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.profileId} = '${profileId}'`) &&
        query.includes(`${POST_REQUEST_SEARCH_ATTRIBUTES.status} IN ('QUEUED', 'FAILED')`),
    ),
  );
});

test('postRequests continues past empty pages of stale Temporal status results', async (t) => {
  const requestA = '00000000-0000-4000-8000-000000000020';
  const requestB = '00000000-0000-4000-8000-000000000021';
  const workflowA = postRequestWorkflowId(ownerAccountId, requestA);
  const workflowB = postRequestWorkflowId(ownerAccountId, requestB);
  let listCount = 0;
  t.mock.method(temporalClient.workflowService, 'listWorkflowExecutions', async () => {
    listCount += 1;
    return (
      listCount === 1
        ? {
            executions: [execution(workflowA)],
            nextPageToken: Buffer.from('native-page-2'),
          }
        : {
            executions: [execution(workflowB)],
            nextPageToken: new Uint8Array(),
          }
    ) as never;
  });
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        query: async () =>
          workflowId === workflowA
            ? requestState(requestA, { status: PostRequestStatus.PUBLISHED })
            : requestState(requestB),
      }) as never,
  );

  const result = await listRequests(profileId, [PostRequestStatus.QUEUED]);
  assert.deepEqual(result.errors, undefined);
  const page = result.data?.postRequests as {
    requests: { requestId: string; status: string }[];
    nextPageToken: string | null;
  };
  assert.deepEqual(
    page.requests.map(({ requestId: id, status }) => [id, status]),
    [[requestB, PostRequestStatus.QUEUED]],
  );
  assert.equal(page.nextPageToken, null);
  assert.equal(listCount, 2);
});

test('postRequests returns empty results for an empty status list without querying Temporal', async (t) => {
  const list = t.mock.method(temporalClient.workflowService, 'listWorkflowExecutions');
  const result = await listRequests(profileId, []);
  assert.deepEqual(result.errors, undefined);
  const page = result.data?.postRequests as {
    requests: { requestId: string; status: string }[];
    nextPageToken: string | null;
  };
  assert.equal(page.requests.length, 0);
  assert.equal(page.nextPageToken, null);
  assert.equal(list.mock.callCount(), 0);
});

test('postRequests validates opaque page tokens at pageToken and requires an authenticated account', async (t) => {
  const list = t.mock.method(temporalClient.workflowService, 'listWorkflowExecutions');
  const invalidToken = await listRequests(profileId, undefined, '!');
  assert.ok(invalidToken.errors?.[0]?.originalError instanceof ValidationError);
  assert.equal((invalidToken.errors?.[0]?.originalError as ValidationError).field, 'pageToken');
  assert.equal(list.mock.callCount(), 0);

  const unauthenticated = await graphql({
    schema,
    source: `
      query PostRequests($profileId: ID!) {
        postRequests(profileId: $profileId) { requests { id } nextPageToken }
      }
    `,
    variableValues: { profileId: encodeGlobalId('Profile', profileId) },
    contextValue: accountContext(null),
  });
  assert.ok(unauthenticated.errors?.[0]?.originalError instanceof PermissionDeniedError);
  assert.equal(list.mock.callCount(), 0);
});

test('postRequests denies foreign Temporal state even when server-side search returns it', async (t) => {
  const foreignRequestId = '00000000-0000-4000-8000-000000000030';
  t.mock.method(
    temporalClient.workflowService,
    'listWorkflowExecutions',
    async () =>
      ({
        executions: [execution(postRequestWorkflowId(ownerAccountId, foreignRequestId))],
        nextPageToken: new Uint8Array(),
      }) as never,
  );
  const workflowIds: string[] = [];
  t.mock.method(temporalClient.workflow, 'getHandle', (workflowId: string) => {
    workflowIds.push(workflowId);
    return {
      query: async () =>
        requestState(foreignRequestId, { accountId: otherAccountId, profileId: otherProfileId }),
    } as never;
  });

  const result = await graphql({
    schema,
    source: `
      query PostRequests($profileId: ID!) {
        postRequests(profileId: $profileId) { requests { requestId } nextPageToken }
      }
    `,
    variableValues: { profileId: encodeGlobalId('Profile', profileId) },
    contextValue: accountContext(ownerAccountId),
  });
  assert.deepEqual(result.errors, undefined);
  const page = result.data?.postRequests as {
    requests: { requestId: string }[];
    nextPageToken: string | null;
  };
  assert.equal(page.requests.length, 0);
  assert.equal(page.nextPageToken, null);
  assert.deepEqual(workflowIds, [postRequestWorkflowId(ownerAccountId, foreignRequestId)]);
});
