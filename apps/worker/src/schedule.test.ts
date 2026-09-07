import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ScheduleAlreadyRunning } from '@temporalio/client';
import { createScheduleIfMissing, createSchedules, parseScheduleEnvironment } from './schedule';
import { notificationCleanupSchedule } from './schedules/notification-cleanup';
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

  assert.throws(() =>
    parseScheduleEnvironment({
      TEMPORAL_ADDRESS: ' ',
      TEMPORAL_NAMESPACE: environment.namespace,
    }),
  );
});

test('스케줄 생성 오류는 호출자에게 전파한다', async () => {
  const failure = new Error('Temporal unavailable');
  const failedScheduleClient = {
    create: async (): Promise<unknown> => {
      throw failure;
    },
  };
  await assert.rejects(
    createScheduleIfMissing(failedScheduleClient, notificationCleanupSchedule('kosmo-dev')),
    (error) => error === failure,
  );
});

test('없는 스케줄은 필요한 실행 연결만 활성 상태로 생성한다', async () => {
  const created: ScheduleOptions[] = [];
  const scheduleClient = {
    create: async (options: ScheduleOptions): Promise<unknown> => {
      created.push(options);
      return undefined;
    },
  };

  const registration = await createScheduleIfMissing(
    scheduleClient,
    notificationCleanupSchedule('kosmo-dev'),
  );
  assert.equal(registration.action, 'created');
  assert.equal(created.length, 1);
  const options = created[0];
  assert.ok(options);
  assert.equal(options.action.type, 'startWorkflow');
  if (options.action.type === 'startWorkflow') {
    assert.equal(options.action.workflowType, 'notificationCleanupWorkflow');
    assert.equal(options.action.taskQueue, KOSMO_TASK_QUEUE);
  }
  assert.equal(options.policies?.overlap, 'SKIP');
  assert.equal(options.state?.paused, false);
});

test('스케줄 목록은 이미 있는 항목을 건너뛰고 나머지도 생성한다', async () => {
  const created: ScheduleOptions[] = [];
  let calls = 0;
  const scheduleClient = {
    create: async (options: ScheduleOptions): Promise<unknown> => {
      calls += 1;
      if (calls === 1) {
        throw new ScheduleAlreadyRunning('already exists', options.scheduleId);
      }
      created.push(options);
      return undefined;
    },
  };

  const registrations = await createSchedules(scheduleClient, [
    notificationCleanupSchedule('kosmo-dev'),
    notificationCleanupSchedule('kosmo-test'),
  ]);

  assert.deepEqual(registrations, [
    { scheduleId, action: 'unchanged' },
    { scheduleId: 'kosmo-test-notification-cleanup', action: 'created' },
  ]);
  assert.equal(calls, 2);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.scheduleId, 'kosmo-test-notification-cleanup');
});
