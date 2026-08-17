import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KOSMO_TASK_QUEUE,
  POST_CREATE_EFFECTS_WORKFLOW_TYPE,
  postCreateEffectsWorkflowId,
  postCreateEffectsWorkflowStartOptions,
} from './post-create-effects';

test('Post Create effects Workflow keeps its existing stable external contract', () => {
  const input = {
    postId: '00000000-0000-8000-8000-000000000001',
    origin: 'LOCAL' as const,
  };

  assert.equal(postCreateEffectsWorkflowId(input.postId), `post-create-effects:${input.postId}`);
  assert.deepEqual(postCreateEffectsWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `post-create-effects:${input.postId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(POST_CREATE_EFFECTS_WORKFLOW_TYPE, 'postCreateEffectsWorkflow');
  assert.equal(KOSMO_TASK_QUEUE, 'kosmo');
});
