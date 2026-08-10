import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/services';
import { createReplyNotificationActivity } from './activities';
import { registration } from './index';

test('Reply business capability는 kosmo task queue에 등록된다', () => {
  assert.equal(KOSMO_TASK_QUEUE, 'kosmo');
  assert.equal(registration.taskQueue, KOSMO_TASK_QUEUE);
  assert.equal(
    (registration.activities as { createReplyNotificationActivity?: unknown })
      .createReplyNotificationActivity,
    createReplyNotificationActivity,
  );
  assert.equal(registration.workflowsPath, new URL('./workflows.ts', import.meta.url).pathname);
});
