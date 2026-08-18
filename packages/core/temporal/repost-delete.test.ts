import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPOST_DELETE_WORKFLOW_TYPE,
  repostDeleteWorkflowId,
  repostDeleteWorkflowStartOptions,
} from './repost-delete';
import { KOSMO_TASK_QUEUE } from './task-queue';

test('Repost Delete Workflow uses the Repost ID and origin in a stable start policy', () => {
  const input = {
    postId: '00000000-0000-8000-8000-000000000001',
    origin: 'ACTIVITYPUB' as const,
  };

  assert.equal(repostDeleteWorkflowId(input.postId), `repost-delete:${input.postId}`);
  assert.deepEqual(repostDeleteWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `repost-delete:${input.postId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(REPOST_DELETE_WORKFLOW_TYPE, 'repostDeleteWorkflow');
});
