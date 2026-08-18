import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POST_REPOST_WORKFLOW_TYPE,
  postRepostWorkflowId,
  postRepostWorkflowStartOptions,
} from './post-repost';
import { KOSMO_TASK_QUEUE } from './task-queue';

test('Post Repost Workflow uses the Post ID and origin in a stable start policy', () => {
  const input = {
    postId: '00000000-0000-8000-8000-000000000001',
    origin: 'ACTIVITYPUB' as const,
  };

  assert.equal(postRepostWorkflowId(input.postId), `post-repost:${input.postId}`);
  assert.deepEqual(postRepostWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `post-repost:${input.postId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(POST_REPOST_WORKFLOW_TYPE, 'postRepostWorkflow');
});
