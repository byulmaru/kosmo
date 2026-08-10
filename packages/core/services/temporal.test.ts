import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KOSMO_TASK_QUEUE,
  REPLY_NOTIFICATION_WORKFLOW_TYPE,
  replyNotificationWorkflowId,
  replyNotificationWorkflowStartOptions,
  startReplyNotificationWorkflow,
} from './temporal';

test('Reply Notification Workflow start는 stable ID와 공통 start policy를 사용한다', () => {
  const replyId = '00000000-0000-8000-8000-000000000001';

  assert.equal(replyNotificationWorkflowId(replyId), `reply-notification:${replyId}`);
  assert.deepEqual(replyNotificationWorkflowStartOptions(replyId), {
    args: [replyId],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: `reply-notification:${replyId}`,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  assert.equal(REPLY_NOTIFICATION_WORKFLOW_TYPE, 'replyNotificationWorkflow');
  assert.equal(KOSMO_TASK_QUEUE, 'kosmo');
});

test('Temporal runtime 입력이 없으면 Workflow start를 연결 전에 거부한다', async () => {
  const previousAddress = process.env.TEMPORAL_ADDRESS;
  const previousNamespace = process.env.TEMPORAL_NAMESPACE;
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_NAMESPACE;

  try {
    await assert.rejects(
      startReplyNotificationWorkflow('00000000-0000-8000-8000-000000000002'),
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
