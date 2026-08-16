import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { NotFoundError } from '@kosmo/core/error';
import type {
  createReplyNotificationActivity as CreateReplyNotificationActivity,
  sendLocalPostCreateActivity as SendLocalPostCreateActivity,
} from './activities';

const calls: string[] = [];
let createNotification = async (postId: string): Promise<void> => {
  calls.push(`notification:${postId}`);
};
let sendCreate = async (postId: string): Promise<void> => {
  calls.push(`delivery:${postId}`);
};

mock.module('@kosmo/core/services', {
  exports: {
    createReplyNotification: (postId: string) => createNotification(postId),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@kosmo/fedify', {
  exports: {
    sendLocalPostCreate: (postId: string) => sendCreate(postId),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let createReplyNotificationActivity: typeof CreateReplyNotificationActivity;
let sendLocalPostCreateActivity: typeof SendLocalPostCreateActivity;

before(async () => {
  ({ createReplyNotificationActivity, sendLocalPostCreateActivity } = await import('./activities'));
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

test('Reply가 아닌 Post는 Notification Activity의 expected no-op이다', async () => {
  createNotification = async () => {
    throw new NotFoundError('Reply not found');
  };

  await assert.doesNotReject(createReplyNotificationActivity('root-post'));
});

test('Notification 저장 실패는 Temporal retry를 위해 다시 던진다', async () => {
  const failure = new Error('database unavailable');
  createNotification = async () => {
    throw failure;
  };

  await assert.rejects(createReplyNotificationActivity('reply-post'), failure);
});

test('Fedify Activity는 canonical queue producer에 Post ID를 전달한다', async () => {
  await sendLocalPostCreateActivity('local-post');

  assert.deepEqual(calls, ['delivery:local-post']);
});
