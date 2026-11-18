import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';

test(
  'Workflow Worker thread의 preload는 별도 production runtime을 시작하지 않는다',
  { timeout: 60_000 },
  async (context) => {
    const expectedAddress = process.env.TEMPORAL_ADDRESS;
    assert.ok(expectedAddress);
    const thread = new Worker(new URL('./test-fixtures/runtime-worker-thread.ts', import.meta.url));
    try {
      const [[address]] = await Promise.all([
        once(thread, 'message', { signal: context.signal }),
        once(thread, 'exit', { signal: context.signal }),
      ]);
      assert.equal(address, expectedAddress);
    } finally {
      await thread.terminate();
    }
  },
);
