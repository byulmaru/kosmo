import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KOSMO_TASK_QUEUE,
  POST_CREATE_EFFECTS_WORKFLOW_TYPE,
  postCreateEffectsWorkflowId,
  postCreateEffectsWorkflowStartOptions,
  startPostCreateEffectsWorkflow,
} from './temporal';

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

test('Temporal runtime 입력이 없으면 effects Workflow start를 연결 전에 거부한다', async () => {
  const previousAddress = process.env.TEMPORAL_ADDRESS;
  const previousNamespace = process.env.TEMPORAL_NAMESPACE;
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_NAMESPACE;

  try {
    await assert.rejects(
      startPostCreateEffectsWorkflow({
        postId: '00000000-0000-8000-8000-000000000002',
        origin: 'LOCAL',
      }),
      /TEMPORAL_ADDRESS is required/,
    );
  } finally {
    if (previousAddress === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.TEMPORAL_NAMESPACE;
    } else {
      process.env.TEMPORAL_NAMESPACE = previousNamespace;
    }
  }
});
