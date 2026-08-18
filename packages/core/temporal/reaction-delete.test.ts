import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REACTION_DELETE_WORKFLOW_TYPE,
  reactionDeleteWorkflowId,
  reactionDeleteWorkflowStartOptions,
} from './reaction-delete';
import { KOSMO_TASK_QUEUE } from './task-queue';

test('Reaction Delete effects Workflow uses the deleted snapshot and a distinct stable ID', () => {
  const input = {
    id: '00000000-0000-8000-8000-000000000001',
    profileId: '00000000-0000-8000-8000-000000000002',
    postId: '00000000-0000-8000-8000-000000000003',
    type: '❤️',
    createdAt: '2026-08-18T00:00:00.000Z',
    origin: 'ACTIVITYPUB' as const,
  };

  assert.equal(reactionDeleteWorkflowId(input.id), `reaction-delete-effects:${input.id}`);
  assert.deepEqual(reactionDeleteWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `reaction-delete-effects:${input.id}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(REACTION_DELETE_WORKFLOW_TYPE, 'reactionDeleteEffectsWorkflow');
  assert.deepEqual(JSON.parse(JSON.stringify(input)), input);
  assert.notEqual(reactionDeleteWorkflowId(input.id), `reaction-create-effects:${input.id}`);
});
