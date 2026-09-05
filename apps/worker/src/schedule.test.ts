import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ScheduleAlreadyRunning } from '@temporalio/client';
import { createNotificationCleanupSchedule, parseScheduleEnvironment } from './schedule';
import type { ScheduleOptions } from '@temporalio/client';

const scheduleId = 'kosmo-dev-notification-cleanup';
const environment = {
  address: 'temporal:7233',
  namespace: 'kosmo-dev',
} as const;

test('스케줄 환경을 Zod로 파싱하고 공백을 제거한다', () => {
  assert.deepEqual(
    parseScheduleEnvironment({
      TEMPORAL_ADDRESS: ` ${environment.address} `,
      TEMPORAL_NAMESPACE: ` ${environment.namespace} `,
    }),
    environment,
  );

  assert.throws(
    () =>
      parseScheduleEnvironment({
        TEMPORAL_ADDRESS: ' ',
        TEMPORAL_NAMESPACE: environment.namespace,
      }),
    /TEMPORAL_ADDRESS is required/,
  );
});

test('이미 존재하는 스케줄은 unchanged로 처리한다', async () => {
  let calls = 0;
  const existingScheduleClient = {
    create: async (): Promise<unknown> => {
      calls += 1;
      throw new ScheduleAlreadyRunning('already exists', scheduleId);
    },
  };
  assert.equal(
    await createNotificationCleanupSchedule(existingScheduleClient, scheduleId),
    'unchanged',
  );
  assert.equal(calls, 1);
});

test('스케줄 생성 오류는 호출자에게 전파한다', async () => {
  const failure = new Error('Temporal unavailable');
  const failedScheduleClient = {
    create: async (): Promise<unknown> => {
      throw failure;
    },
  };
  await assert.rejects(
    createNotificationCleanupSchedule(failedScheduleClient, scheduleId),
    (error) => error === failure,
  );
});

test('없는 스케줄은 활성 24시간 주기와 SKIP 옵션으로 한 번 생성한다', async () => {
  const created: ScheduleOptions[] = [];
  const scheduleClient = {
    create: async (options: ScheduleOptions): Promise<unknown> => {
      created.push(options);
      return undefined;
    },
  };

  assert.equal(await createNotificationCleanupSchedule(scheduleClient, scheduleId), 'created');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0], {
    scheduleId,
    spec: { intervals: [{ every: '24 hours' }] },
    action: {
      type: 'startWorkflow',
      workflowType: 'notificationCleanupWorkflow',
      workflowId: `${scheduleId}-workflow`,
      taskQueue: KOSMO_TASK_QUEUE,
      args: [],
    },
    policies: { overlap: 'SKIP' },
    state: { paused: false },
  });
});
