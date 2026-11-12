import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Home timeline invalidation rejects Redis failures and retries successfully', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';

let calls = 0;
let scanKeys = [];
let steps = [];
const commands = [];
const cachedKeys = new Set();

const client = {
  async scan(cursor, options) {
    commands.push('scan');
    return { cursor: '0', keys: scanKeys };
  },
  async unlink(keys) {
    commands.push('unlink');
    let deleted = 0;
    for (const key of keys) {
      deleted += Number(cachedKeys.delete(key));
    }
    return deleted;
  },
};

mock.module(new URL('../redis/client.ts', import.meta.url), {
  exports: {
    runRedisCommand: async (command) => {
      calls += 1;
      const step = steps.shift();
      assert.ok(step, 'unexpected Redis command');
      if (!step.execute) {
        return null;
      }
      const value = await command(client);
      return step.result === 'null' ? null : { value };
    },
  },
});

const { invalidateHomeTimelines } = await import('./cache.ts');
const reset = ({ keys = [] } = {}) => {
  calls = 0;
  commands.length = 0;
  steps = [];
  scanKeys = keys;
  cachedKeys.clear();
};

delete process.env.REDIS_URL;
await invalidateHomeTimelines({ profileIds: ['unconfigured'] });
await invalidateHomeTimelines();
process.env.REDIS_URL = '  ';
await invalidateHomeTimelines({ profileIds: ['blank'] });
assert.equal(calls, 0, 'unconfigured invalidation should not call Redis');

process.env.REDIS_URL = 'redis://mock';
const failures = [
  {
    name: 'targeted UNLINK cold response',
    input: { profileIds: ['targeted'] },
    steps: [{ execute: false }],
    expectedCommands: [],
  },
  {
    name: 'global SCAN cold response',
    input: {},
    steps: [{ execute: false }],
    expectedCommands: [],
  },
  {
    name: 'global UNLINK unavailable response',
    input: {},
    keys: ['kosmo:home-timeline:profile:global'],
    steps: [{ execute: true }, { execute: true, result: 'null' }],
    expectedCommands: ['scan', 'unlink'],
  },
];

for (const { name, input, keys, steps: caseSteps, expectedCommands } of failures) {
  reset({ keys });
  steps.push(...caseSteps);
  await assert.rejects(invalidateHomeTimelines(input), Error, name);
  assert.deepEqual(commands, expectedCommands, name);
}

reset();
steps.push({ execute: true });
await invalidateHomeTimelines({ profileIds: ['already-absent'] });
assert.deepEqual(commands, ['unlink'], 'UNLINK returning zero should succeed');

reset();
const retryKey = 'kosmo:home-timeline:profile:retry';
cachedKeys.add(retryKey);
steps.push({ execute: false }, { execute: true });
await assert.rejects(invalidateHomeTimelines({ profileIds: ['retry'] }), Error);
assert.equal(cachedKeys.has(retryKey), true);
await invalidateHomeTimelines({ profileIds: ['retry'] });
assert.equal(cachedKeys.has(retryKey), false, 'a retry should remove the cached key');
assert.deepEqual(commands, ['unlink']);
assert.equal(calls, 2);
`;

  const result = spawnSync(
    process.execPath,
    [
      '--experimental-test-module-mocks',
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      childScript,
    ],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      timeout: 5_000,
    },
  );

  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
