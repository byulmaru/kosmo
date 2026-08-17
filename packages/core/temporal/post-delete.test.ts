import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POST_DELETE_WORKFLOW_TYPE,
  postDeleteWorkflowId,
  postDeleteWorkflowStartOptions,
} from './post-delete';
import { KOSMO_TASK_QUEUE } from './task-queue';

test('Post Delete Workflow uses the Post ID and origin in a stable start policy', () => {
  const input = {
    effectKind: 'CONTENT' as const,
    postId: '00000000-0000-8000-8000-000000000001',
    origin: 'LOCAL' as const,
  };

  assert.equal(postDeleteWorkflowId(input.postId), `post-delete:${input.postId}`);
  assert.deepEqual(postDeleteWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `post-delete:${input.postId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(POST_DELETE_WORKFLOW_TYPE, 'postDeleteWorkflow');
});
