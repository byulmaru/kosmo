import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthStatus, runWorker } from './worker';

test('business handler가 없으면 외부 연결 전에 실패한다', async () => {
  await assert.rejects(runWorker(undefined, {}), /No business Worker/);
  await assert.rejects(runWorker({ taskQueue: 'reserved-but-empty' }, {}), /No business Worker/);
  await assert.rejects(
    runWorker({ activities: { example: () => undefined }, taskQueue: ' ' }, {}),
    /No business Worker/,
  );
});

test('Temporal environment를 검증한다', async () => {
  const registration = {
    activities: { example: () => undefined },
    taskQueue: 'test',
  };

  await assert.rejects(runWorker(registration, {}), /TEMPORAL_ADDRESS/);
  await assert.rejects(
    runWorker(registration, { TEMPORAL_ADDRESS: 'temporal.test:7233' }),
    /TEMPORAL_NAMESPACE/,
  );
  await assert.rejects(
    runWorker(registration, {
      PORT: '0',
      TEMPORAL_ADDRESS: 'temporal.test:7233',
      TEMPORAL_NAMESPACE: 'kosmo-test',
    }),
    /PORT must be an integer/,
  );
});

test('SDK Worker 상태를 health 응답에 그대로 반영한다', () => {
  assert.equal(healthStatus('/health'), 200);
  assert.equal(healthStatus('/ready', 'INITIALIZED'), 503);
  assert.equal(healthStatus('/ready', 'RUNNING'), 200);
  assert.equal(healthStatus('/ready', 'STOPPING'), 503);
  assert.equal(healthStatus('/unknown', 'RUNNING'), 404);
});
