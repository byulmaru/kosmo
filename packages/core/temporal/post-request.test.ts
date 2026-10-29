import assert from 'node:assert/strict';
import test from 'node:test';
import { postRequestWorkflow, postRequestWorkflowId } from './post-request';
import type { PostRequestWorkflowArgs } from './post-request';

test('Post Request Workflow ID scopes a request to its Account and request ID', () => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const requestId = '00000000-0000-4000-8000-000000000002';
  const args: PostRequestWorkflowArgs = {
    input: {
      accountId,
      bodyText: 'Post body',
      origin: 'LOCAL',
      profileId: '00000000-0000-4000-8000-000000000003',
      visibility: 'PUBLIC',
    },
    mediaProcessing: [],
    postId: '00000000-0000-4000-8000-000000000004',
    requestId,
    submittedAt: '2026-10-29T00:00:00.000Z',
  };
  const expectedWorkflowId = `post-request:${accountId}:${requestId}`;

  assert.equal(postRequestWorkflowId(accountId, requestId), expectedWorkflowId);
  assert.equal(postRequestWorkflow.workflowIdFromArgs(args), expectedWorkflowId);
});
