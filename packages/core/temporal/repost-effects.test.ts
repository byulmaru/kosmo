import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from './post-create-effects';
import {
  REPOST_EFFECTS_WORKFLOW_TYPE,
  repostEffectsWorkflowId,
  repostEffectsWorkflowStartOptions,
} from './repost-effects';

test('Repost create와 delete는 Repost ID와 transition으로 stable Workflow ID를 구분한다', () => {
  assert.equal(
    repostEffectsWorkflowId({
      repostId: '00000000-0000-8000-8000-000000000001',
      transition: 'CREATE',
    }),
    'repost-effects:00000000-0000-8000-8000-000000000001:create',
  );
  assert.equal(
    repostEffectsWorkflowId({
      repostId: '00000000-0000-8000-8000-000000000001',
      transition: 'DELETE',
    }),
    'repost-effects:00000000-0000-8000-8000-000000000001:delete',
  );
});

test('Repost create start options는 동일 transition을 기존 execution으로 수렴시킨다', () => {
  const input = {
    origin: 'LOCAL' as const,
    repostId: '00000000-0000-8000-8000-000000000001',
    transition: 'CREATE' as const,
  };

  assert.deepEqual(repostEffectsWorkflowStartOptions(input), {
    args: [input],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: 'repost-effects:00000000-0000-8000-8000-000000000001:create',
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(REPOST_EFFECTS_WORKFLOW_TYPE, 'repostEffectsWorkflow');
});

test('Repost delete input은 최소 Tombstone snapshot을 serializable하게 보존한다', () => {
  const input = {
    actorProfileId: '00000000-0000-8000-8000-000000000002',
    createdAt: '2026-08-16T00:00:00.000Z',
    origin: 'ACTIVITYPUB' as const,
    repostId: '00000000-0000-8000-8000-000000000001',
    sourcePostId: '00000000-0000-8000-8000-000000000003',
    transition: 'DELETE' as const,
    visibility: 'UNLISTED' as const,
  };

  assert.deepEqual(repostEffectsWorkflowStartOptions(input).args, [input]);
  assert.equal(
    repostEffectsWorkflowStartOptions(input).workflowId,
    'repost-effects:00000000-0000-8000-8000-000000000001:delete',
  );
});
