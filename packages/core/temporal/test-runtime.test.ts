import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestTemporalRuntime } from './test-runtime';

test('Temporal child startup failure reports exit metadata', async () => {
  const previousNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--kosmo-invalid-node-option';

  try {
    await assert.rejects(startTestTemporalRuntime(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Temporal test process exited before becoming ready/);
      assert.match(error.message, /http:\/\/127\.0\.0\.1:\d+\/health/);
      assert.match(error.message, /exitCode=\d+/);
      assert.match(error.message, /signal=null/);
      return true;
    });
  } finally {
    if (previousNodeOptions === undefined) {
      delete process.env.NODE_OPTIONS;
    } else {
      process.env.NODE_OPTIONS = previousNodeOptions;
    }
  }
});
