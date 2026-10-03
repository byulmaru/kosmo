import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { Connection, ScheduleAlreadyRunning, ScheduleClient } from '@temporalio/client';
import { runSchedules } from './schedule';
import type { ConnectionLike, ScheduleOptions } from '@temporalio/client';

const scheduleId = 'kosmo-dev-notification-cleanup';
const productionSnapshotScheduleId = 'kosmo-prod-database-counts-snapshot';

test('스케줄 생성 오류는 호출자에게 전파한다', async (t) => {
  const failure = new Error('Temporal unavailable');
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async () => {
    throw failure;
  });

  await assert.rejects(runSchedules(connection, 'kosmo-dev', 'dev'), (error) => error === failure);
});

test('없는 스케줄은 필요한 실행 연결만 활성 상태로 생성한다', async (t) => {
  const created: ScheduleOptions[] = [];
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async (options: ScheduleOptions) => {
    created.push(options);
    return undefined;
  });

  const registrations = await runSchedules(connection, 'kosmo-dev', 'dev');
  assert.deepEqual(registrations, [{ scheduleId, action: 'created' }]);
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

test('이미 있는 스케줄은 정상 처리한다', async (t) => {
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async (options: ScheduleOptions) => {
    throw new ScheduleAlreadyRunning('already exists', options.scheduleId);
  });

  assert.deepEqual(await runSchedules(connection, 'kosmo-dev', 'dev'), [
    { scheduleId, action: 'unchanged' },
  ]);
});

test('database snapshot 스케줄은 ENVIRONMENT가 prod일 때만 등록한다', async (t) => {
  const created: ScheduleOptions[] = [];
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async (options: ScheduleOptions) => {
    created.push(options);
    return undefined;
  });

  const registrations = await runSchedules(connection, 'kosmo-prod', 'prod');
  assert.deepEqual(registrations, [
    { scheduleId: 'kosmo-prod-notification-cleanup', action: 'created' },
    { scheduleId: productionSnapshotScheduleId, action: 'created' },
  ]);
  assert.equal(created.length, 2);
  const options = created[1];
  assert.ok(options);
  assert.equal(options.scheduleId, productionSnapshotScheduleId);
  assert.deepEqual(options.spec?.intervals, [{ every: '24 hours' }]);
  assert.equal(options.action.type, 'startWorkflow');
  if (options.action.type === 'startWorkflow') {
    assert.equal(options.action.workflowType, 'databaseCountsSnapshotWorkflow');
    assert.equal(options.action.taskQueue, KOSMO_TASK_QUEUE);
  }
  assert.equal(options.policies?.overlap, 'SKIP');
});

test('database snapshot 스케줄은 namespace 이름이 prod여도 dev에서는 등록하지 않는다', async (t) => {
  const created: ScheduleOptions[] = [];
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async (options: ScheduleOptions) => {
    created.push(options);
    return undefined;
  });

  await runSchedules(connection, 'kosmo-prod', 'dev');
  assert.deepEqual(
    created.map(({ scheduleId: id }) => id),
    ['kosmo-prod-notification-cleanup'],
  );
});
