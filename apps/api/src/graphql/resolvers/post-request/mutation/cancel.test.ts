import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError } from '@kosmo/core/error';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_CANCEL_UPDATE,
  POST_REQUEST_STATE_QUERY,
  PostRequestStatus,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';
import type { ExecutionResult } from 'graphql';

const accountId = '00000000-0000-4000-8000-000000000001';
const profileId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';

const snapshot: PostRequestState['snapshot'] = {
  input: {
    accountId,
    bodyText: 'Post body',
    contentWarning: null,
    media: [
      {
        altText: 'Image alt text',
        applyNightshade: true,
        mediaId: '00000000-0000-4000-8000-000000000004',
      },
    ],
    mentions: [],
    origin: 'LOCAL',
    profileId,
    sensitiveMedia: false,
    visibility: 'PUBLIC',
  },
  postId: '00000000-0000-4000-8000-000000000005',
  requestId,
  submittedAt: '2026-10-29T00:00:00.000Z',
};

type CancelPostRequestResult = {
  cancelPostRequest: { request: { status: string } };
};

const requestCancel = () =>
  graphql({
    schema,
    source: `
      mutation CancelPostRequest($input: CancelPostRequestInput!) {
        cancelPostRequest(input: $input) {
          request { status }
        }
      }
    `,
    variableValues: { input: { requestId } },
    contextValue: { session: { accountId } },
  }) as Promise<ExecutionResult<CancelPostRequestResult>>;

test('cancelPostRequest sends an idempotent Update to an active request', async (t) => {
  const workflowId = postRequestWorkflowId(accountId, requestId);
  const current: PostRequestState = { snapshot, status: PostRequestStatus.PROCESSING };
  const updated: PostRequestState = { snapshot, status: PostRequestStatus.CANCELLED };
  const query = t.mock.fn(async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return current;
  });
  const executeUpdate = t.mock.fn(
    async (updateName: string, options: { args?: unknown[]; updateId?: string }) => {
      assert.equal(updateName, POST_REQUEST_CANCEL_UPDATE);
      assert.deepEqual(options.args, []);
      assert.equal(options.updateId, `cancel:${requestId}`);
      return updated;
    },
  );
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return { executeUpdate, query } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestCancel();
  assert.deepEqual(result.errors, undefined);
  assert.equal(result.data?.cancelPostRequest.request.status, 'CANCELLED');
  assert.equal(executeUpdate.mock.callCount(), 1);
});

test('cancelPostRequest admits a queued request through an Update', async (t) => {
  const workflowId = postRequestWorkflowId(accountId, requestId);
  const current: PostRequestState = { snapshot, status: PostRequestStatus.QUEUED };
  const updated: PostRequestState = { snapshot, status: PostRequestStatus.CANCELLED };
  const query = t.mock.fn(async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return current;
  });
  const executeUpdate = t.mock.fn(async (updateName: string) => {
    assert.equal(updateName, POST_REQUEST_CANCEL_UPDATE);
    return updated;
  });
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return { executeUpdate, query } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestCancel();
  assert.deepEqual(result.errors, undefined);
  assert.equal(result.data?.cancelPostRequest.request.status, 'CANCELLED');
  assert.equal(executeUpdate.mock.callCount(), 1);
});

test('cancelPostRequest rejects a request once publishing has begun', async (t) => {
  const workflowId = postRequestWorkflowId(accountId, requestId);
  let current: PostRequestState = { snapshot, status: PostRequestStatus.PUBLISHING };
  const query = t.mock.fn(async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return current;
  });
  const executeUpdate = t.mock.fn();
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return { executeUpdate, query } as never;
  });
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    throw new Error('A publishing post request must not start another Workflow');
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  for (const status of [
    PostRequestStatus.PUBLISHING,
    PostRequestStatus.CONFIRMING,
    PostRequestStatus.PUBLISHED,
  ]) {
    current = { snapshot, status };
    const result = await requestCancel();
    assert.ok(result.errors?.[0]?.originalError instanceof ConflictError);
    assert.equal(result.errors?.[0]?.message, 'Post request can no longer be cancelled');
  }

  assert.equal(executeUpdate.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
});

test('cancelPostRequest returns an existing cancellation without another Update', async (t) => {
  const workflowId = postRequestWorkflowId(accountId, requestId);
  const current: PostRequestState = { snapshot, status: PostRequestStatus.CANCELLED };
  const query = t.mock.fn(async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return current;
  });
  const executeUpdate = t.mock.fn();
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return { executeUpdate, query } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestCancel();
  assert.deepEqual(result.errors, undefined);
  assert.equal(result.data?.cancelPostRequest.request.status, 'CANCELLED');
  assert.equal(query.mock.callCount(), 1);
  assert.equal(executeUpdate.mock.callCount(), 0);
});

test('cancelPostRequest rejects an already finished request without starting a new Workflow', async (t) => {
  const workflowId = postRequestWorkflowId(accountId, requestId);
  const current: PostRequestState = { snapshot, status: PostRequestStatus.FAILED };
  const query = t.mock.fn(async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return current;
  });
  const executeUpdate = t.mock.fn();
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return { executeUpdate, query } as never;
  });
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    throw new Error('A finished post request must not start another Workflow');
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestCancel();
  assert.ok(result.errors?.[0]?.originalError instanceof ConflictError);
  assert.equal(result.errors?.[0]?.message, 'Post request is already finished');
  assert.equal(query.mock.callCount(), 1);
  assert.equal(executeUpdate.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
});
