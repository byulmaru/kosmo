import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Home timeline invalidation rejects Redis failures and retries successfully', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const cacheKeyPrefix = 'kosmo:home-timeline:profile:';
const cachedKeys = new Set();
let unavailableOperation;

const failIfUnavailable = (operation) => {
  if (unavailableOperation !== operation) return;
  unavailableOperation = undefined;
  throw new Error('Redis unavailable');
};

const client = {
  async scan(cursor, options) {
    failIfUnavailable('scan');
    const prefix = options.MATCH.slice(0, -1);
    return {
      cursor: '0',
      keys: [...cachedKeys].filter((key) => key.startsWith(prefix)),
    };
  },
  async unlink(keys) {
    failIfUnavailable('unlink');
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
      if (!process.env.REDIS_URL?.trim()) return null;
      try {
        return { value: await command(client) };
      } catch {
        return null;
      }
    },
  },
});

const { invalidateHomeTimelines } = await import('./cache.ts');

const targetedKey = cacheKeyPrefix + 'targeted';
const globalKey = cacheKeyPrefix + 'global';
const retryKey = cacheKeyPrefix + 'retry';
cachedKeys.add(targetedKey);
cachedKeys.add(globalKey);
cachedKeys.add(cacheKeyPrefix + 'unrelated');
cachedKeys.add('kosmo:other-cache:retained');

delete process.env.REDIS_URL;
await invalidateHomeTimelines({ profileIds: ['unconfigured'] });
await invalidateHomeTimelines();
process.env.REDIS_URL = '  ';
await invalidateHomeTimelines({ profileIds: ['blank'] });
assert.ok(cachedKeys.has(targetedKey));
assert.ok(cachedKeys.has(globalKey));

process.env.REDIS_URL = 'redis://mock';
unavailableOperation = 'unlink';
await assert.rejects(invalidateHomeTimelines({ profileIds: ['targeted'] }), Error);
assert.ok(cachedKeys.has(targetedKey));
await invalidateHomeTimelines({ profileIds: ['targeted'] });
assert.ok(!cachedKeys.has(targetedKey));
assert.ok(cachedKeys.has(globalKey));

unavailableOperation = 'scan';
await assert.rejects(invalidateHomeTimelines(), Error);
assert.ok(cachedKeys.has(globalKey));
await invalidateHomeTimelines();
assert.ok(!cachedKeys.has(globalKey));
assert.ok(!cachedKeys.has(cacheKeyPrefix + 'unrelated'));
assert.ok(cachedKeys.has('kosmo:other-cache:retained'));

cachedKeys.add(retryKey);
unavailableOperation = 'unlink';
await assert.rejects(invalidateHomeTimelines(), Error);
assert.ok(cachedKeys.has(retryKey));
await invalidateHomeTimelines();
assert.ok(!cachedKeys.has(retryKey));

await invalidateHomeTimelines({ profileIds: ['already-absent'] });
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
