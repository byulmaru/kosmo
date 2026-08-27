import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { healthStatus, validateWorkerEnvironment } from './worker';
import type { AddressInfo, Socket } from 'node:net';

test('Notification Cleanup Activity는 dev-only Temporal client를 import하지 않는다', async () => {
  const source = await readFile(
    new URL('./activities/cleanup-unavailable-notifications.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /from '@temporalio\/client'/);
});

test('Temporal environment를 검증한다', async () => {
  assert.throws(() => validateWorkerEnvironment({}), /TEMPORAL_ADDRESS/);
  assert.throws(
    () => validateWorkerEnvironment({ TEMPORAL_ADDRESS: 'temporal.test:7233' }),
    /TEMPORAL_NAMESPACE/,
  );
  assert.throws(
    () =>
      validateWorkerEnvironment({
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

test('Temporal connect 중 SIGTERM을 process 종료로 전달한다', { timeout: 5_000 }, async (t) => {
  const temporal = createServer();
  const sockets = new Set<Socket>();
  temporal.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  temporal.listen(0, '127.0.0.1');
  await once(temporal, 'listening');
  t.after(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
    return temporal[Symbol.asyncDispose]();
  });

  const healthPortReservation = createServer();
  healthPortReservation.listen(0, '127.0.0.1');
  await once(healthPortReservation, 'listening');
  const healthPort = (healthPortReservation.address() as AddressInfo).port;
  await healthPortReservation[Symbol.asyncDispose]();

  const temporalPort = (temporal.address() as AddressInfo).port;
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname],
    {
      cwd: import.meta.dirname,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(healthPort),
        TEMPORAL_ADDRESS: `127.0.0.1:${temporalPort}`,
        TEMPORAL_NAMESPACE: 'test',
      },
    },
  );
  t.after(() => child.kill('SIGKILL'));

  await once(temporal, 'connection');
  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit');

  assert.equal(code, null);
  assert.equal(signal, 'SIGTERM');
});
