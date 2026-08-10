import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresMessageQueue } from '@fedify/postgres';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

describe('Fedify PostgreSQL message queue', { skip: !databaseUrl }, () => {
  test('consumes an accepted message after reconnecting', async () => {
    const message = { messageId: randomUUID() };
    const producerSql = postgres(databaseUrl!);
    await new PostgresMessageQueue(producerSql).enqueue(message);
    await producerSql.end({ timeout: 5 });

    const consumerSql = postgres(databaseUrl!);
    const consumerQueue = new PostgresMessageQueue(consumerSql);
    const controller = new AbortController();
    let consumed: unknown;

    try {
      await Promise.race([
        consumerQueue.listen(
          (value) => {
            consumed = value;
            controller.abort();
          },
          { signal: controller.signal },
        ),
        delay(10_000, undefined, { ref: false }).then(() => {
          throw new Error('Fedify queue listener timed out.');
        }),
      ]);
      assert.deepEqual(consumed, message);
    } finally {
      controller.abort();
      await consumerSql.end({ timeout: 5 });
    }
  });

  test('starts and stops the standalone consumer', async () => {
    const port = 18_080 + Number(process.env.KOSMO_TEST_PORT_OFFSET ?? 0);
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/consumer.ts'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        FEDIFY_QUEUE_DATABASE_URL: databaseUrl,
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
});
