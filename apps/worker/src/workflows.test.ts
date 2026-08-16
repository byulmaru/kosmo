import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import type { postCreateEffectsWorkflow as PostCreateEffectsWorkflow } from './workflows';

const calls: string[] = [];
let createNotification = async (postId: string): Promise<void> => {
  calls.push(`notification:${postId}`);
};
let sendCreate = async (postId: string): Promise<void> => {
  calls.push(`delivery:${postId}`);
};

mock.module('@temporalio/workflow', {
  exports: {
    proxyActivities: () => ({
      createReplyNotificationActivity: (postId: string) => createNotification(postId),
      sendLocalPostCreateActivity: (postId: string) => sendCreate(postId),
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let postCreateEffectsWorkflow: typeof PostCreateEffectsWorkflow;

before(async () => {
  ({ postCreateEffectsWorkflow } = await import('./workflows'));
});

beforeEach(() => {
  calls.length = 0;
  createNotification = async (postId) => {
    calls.push(`notification:${postId}`);
  };
  sendCreate = async (postId) => {
    calls.push(`delivery:${postId}`);
  };
});

test('Local Post는 Notification과 Fedify handoff를 모두 실행한다', async () => {
  await postCreateEffectsWorkflow({ origin: 'LOCAL', postId: 'local-post' });

  assert.deepEqual(calls.sort(), ['delivery:local-post', 'notification:local-post']);
});

test('ActivityPub Post는 outbound Create handoff를 실행하지 않는다', async () => {
  await postCreateEffectsWorkflow({ origin: 'ACTIVITYPUB', postId: 'remote-post' });

  assert.deepEqual(calls, ['notification:remote-post']);
});

test('한 Activity의 terminal failure가 다른 Activity 시도를 막지 않는다', async () => {
  const notificationFailure = new Error('notification failed');
  createNotification = async (postId) => {
    calls.push(`notification:${postId}`);
    throw notificationFailure;
  };

  await assert.rejects(
    postCreateEffectsWorkflow({ origin: 'LOCAL', postId: 'failed-post' }),
    notificationFailure,
  );
  assert.deepEqual(calls.sort(), ['delivery:failed-post', 'notification:failed-post']);
});
