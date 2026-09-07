import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { Connection, ScheduleAlreadyRunning, ScheduleClient } from '@temporalio/client';
import { runSchedules } from './schedule';
import type { ConnectionLike, ScheduleOptions } from '@temporalio/client';

const scheduleId = 'kosmo-dev-notification-cleanup';

test('스케줄 생성 오류는 호출자에게 전파한다', async (t) => {
  const failure = new Error('Temporal unavailable');
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async () => {
    throw failure;
  });

  await assert.rejects(runSchedules(connection, 'kosmo-dev'), (error) => error === failure);
});

test('없는 스케줄은 필요한 실행 연결만 활성 상태로 생성한다', async (t) => {
  const created: ScheduleOptions[] = [];
  const connection: ConnectionLike = Connection.lazy();
  t.after(() => connection.close());
  t.mock.method(ScheduleClient.prototype, 'create', async (options: ScheduleOptions) => {
    created.push(options);
    return undefined;
  });

  const registrations = await runSchedules(connection, 'kosmo-dev');
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

  assert.deepEqual(await runSchedules(connection, 'kosmo-dev'), [
    { scheduleId, action: 'unchanged' },
  ]);
});
