import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from './client';
import {
  POST_CREATE_EFFECTS_WORKFLOW_TYPE,
  postCreateEffectsWorkflowId,
  postCreateEffectsWorkflowStartOptions,
} from './post-create-effects';

test('Post Create effects Workflow start는 Post ID와 origin을 포함한 stable start policy를 사용한다', () => {
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
