import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const databaseUrl = process.env.DATABASE_URL;

test('starts and stops the standalone consumer', { skip: !databaseUrl }, async () => {
  const port = 18_080 + (Number(process.env.KOSMO_TEST_PORT_OFFSET ?? 0) % 40_000);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      FEDIFY_QUEUE_DATABASE_URL: databaseUrl,
      TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233',
      TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE ?? 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/ready`)).ok) {
          break;
        }
      } catch {
        // The consumer has not started its private probe server yet.
      }
      await delay(50);
    }
    assert.ok(Date.now() < deadline, stderr || 'Fedify consumer readiness timed out.');

    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'exit');
    assert.equal(signal, null, stderr);
    assert.equal(code, 0, stderr);
  } finally {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill('SIGKILL');
    }
  }
});
