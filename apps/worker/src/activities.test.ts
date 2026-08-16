import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { db } from '@kosmo/core/db';
import type {
  createReplyNotificationActivity as CreateReplyNotificationActivity,
  sendLocalPostCreateActivity as SendLocalPostCreateActivity,
} from './activities';

const calls: string[] = [];
let sendCreate = async (postId: string): Promise<void> => {
  calls.push(`delivery:${postId}`);
};
let sourceRows: unknown[] = [];
let transactionFailure: unknown;
let insertFailure: unknown;
const insertedValues: unknown[] = [];
const conflictTargets: unknown[] = [];

mock.module('@kosmo/fedify', {
  exports: {
    sendLocalPostCreate: (postId: string) => sendCreate(postId),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let createReplyNotificationActivity: typeof CreateReplyNotificationActivity;
let sendLocalPostCreateActivity: typeof SendLocalPostCreateActivity;

before(async () => {
  ({ createReplyNotificationActivity, sendLocalPostCreateActivity } = await import('./activities'));
  mock.method(db, 'transaction', async (callback: (tx: never) => unknown) => {
    if (transactionFailure) {
      throw transactionFailure;
    }

    const query = (rows: unknown[]) => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        limit: () => builder,
        then: <T>(onFulfilled: (value: unknown[]) => T | PromiseLike<T>) =>
          Promise.resolve(rows).then(onFulfilled),
      };
      return builder;
    };

    const transaction = {
      select: () => query(sourceRows),
      insert: () => ({
        values: (values: unknown) => ({
          onConflictDoNothing: (target: unknown) => {
            insertedValues.push(values);
            conflictTargets.push(target);
            return insertFailure ? Promise.reject(insertFailure) : Promise.resolve();
          },
        }),
      }),
    };

    return callback(transaction as never);
  });
});

beforeEach(() => {
  calls.length = 0;
  sendCreate = async (postId) => {
    calls.push(`delivery:${postId}`);
  };
  sourceRows = [];
  transactionFailure = undefined;
  insertFailure = undefined;
  insertedValues.length = 0;
  conflictTargets.length = 0;
});

test('missing/non-reply Post는 Notification Activity의 expected no-op이다', async () => {
  await assert.doesNotReject(createReplyNotificationActivity('root-post'));
  assert.deepEqual(insertedValues, []);
});

test('visible Reply는 recipient와 source를 보존하고 unique conflict를 무시한다', async () => {
  sourceRows = [
    {
      id: 'reply-post',
      recipientProfileId: 'recipient',
    },
  ];

  await createReplyNotificationActivity('reply-post');

  assert.deepEqual(insertedValues, [
    {
      data: {},
      kind: 'REPLY',
      recipientProfileId: 'recipient',
      sourceId: 'reply-post',
    },
  ]);
  assert.equal(conflictTargets.length, 1);
});

test('DB 실패는 Temporal retry를 위해 다시 던진다', async () => {
  const failure = new Error('database unavailable');
  transactionFailure = failure;

  await assert.rejects(createReplyNotificationActivity('reply-post'), failure);

  transactionFailure = undefined;
  sourceRows = [
    {
      id: 'reply-post',
      recipientProfileId: 'recipient',
    },
  ];
  insertFailure = failure;
  await assert.rejects(createReplyNotificationActivity('reply-post'), failure);
});

test('Fedify Activity는 canonical queue producer에 Post ID를 전달한다', async () => {
  await sendLocalPostCreateActivity('local-post');

  assert.deepEqual(calls, ['delivery:local-post']);
});
