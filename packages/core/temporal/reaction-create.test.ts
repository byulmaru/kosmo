import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REACTION_CREATE_WORKFLOW_TYPE,
  reactionCreateWorkflowId,
  reactionCreateWorkflowStartOptions,
} from './reaction-create';
import { KOSMO_TASK_QUEUE } from './task-queue';

test('Reaction Create effects Workflow uses a stable ID and serializable input', () => {
  const input = {
    reactionId: '00000000-0000-8000-8000-000000000001',
    origin: 'LOCAL' as const,
  };

  assert.equal(
    reactionCreateWorkflowId(input.reactionId),
    `reaction-create-effects:${input.reactionId}`,
  );
  assert.deepEqual(reactionCreateWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `reaction-create-effects:${input.reactionId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(REACTION_CREATE_WORKFLOW_TYPE, 'reactionCreateEffectsWorkflow');
  assert.deepEqual(JSON.parse(JSON.stringify(input)), input);
});
