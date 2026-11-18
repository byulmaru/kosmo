import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('scans hash pages and preserves first decisions without refreshing TTLs', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const hashValues = new Map();
const hashExpirations = new Map();
const scalarValues = new Map();
let now = 1_000;
let redisAvailable = true;
let commandFails = false;

const expiryKey = (key, field) => key + '\u0000' + field;
const currentHashValue = (key, field) => {
  const fieldKey = expiryKey(key, field);
  const expiresAt = hashExpirations.get(fieldKey);
  if (expiresAt !== undefined && expiresAt <= now) {
    hashValues.get(key)?.delete(field);
    hashExpirations.delete(fieldKey);
  }
  return hashValues.get(key)?.get(field) ?? null;
};
const currentScalarValue = (key) => scalarValues.get(key) ?? null;

const client = {
  async hGet(key, field) {
    if (commandFails) throw new Error('Redis unavailable');
    return currentHashValue(key, field);
  },
  async get(key) {
    if (commandFails) throw new Error('Redis unavailable');
    return currentScalarValue(key);
  },
  async hSetEx(key, fields, options) {
    if (commandFails) throw new Error('Redis unavailable');
    const [[field, value]] = Object.entries(fields);
    if (options.mode === 'FNX' && currentHashValue(key, field) !== null) {
      return 0;
    }
    const hash = hashValues.get(key) ?? new Map();
    hash.set(field, value);
    hashValues.set(key, hash);
    if (options.expiration?.type === 'EX') {
      hashExpirations.set(expiryKey(key, field), now + options.expiration.value * 1_000);
    }
    return 1;
  },
  async hScan(key, cursor) {
    if (commandFails) throw new Error('Redis unavailable');
    if (cursor === '0') {
      const entries = [...(hashValues.get(key)?.keys() ?? [])].flatMap((field) => {
        const value = currentHashValue(key, field);
        return value === null ? [] : [{ field, value }];
      });
      return { cursor: '23', entries };
    }
    if (cursor === '23') {
      return { cursor: '0', entries: [] };
    }
    if (cursor === '17') {
      return { cursor: '29', entries: [] };
    }
    return { cursor: '0', entries: [] };
  },
};

mock.module(new URL('../redis/client.ts', import.meta.url), {
  exports: {
    runRedisCommand: async (command) => {
      if (!redisAvailable) return null;
      try {
        return { value: await command(client) };
      } catch {
        return null;
      }
    },
  },
});

const {
  cacheNaturalLanguageMuteDecision,
  getNaturalLanguageMuteDecision,
  scanNaturalLanguageMuteDecisions,
} = await import('./natural-language-mute-cache.ts');

const cachePrefix = 'kosmo:home-timeline:natural-language-mute:profile:';
const profileHashKey = cachePrefix + 'profile-a';
const firstPostId = 'post-a';
assert.equal(await getNaturalLanguageMuteDecision('profile-a', firstPostId), null);
const firstDecision = { decision: 'exclude', probability: 0.8 };
const conflictingDecision = { decision: 'include', probability: 0.79 };
const [firstConcurrent, secondConcurrent] = await Promise.all([
  cacheNaturalLanguageMuteDecision('profile-a', firstPostId, firstDecision),
  cacheNaturalLanguageMuteDecision('profile-a', firstPostId, conflictingDecision),
]);
assert.deepEqual([firstConcurrent, secondConcurrent], [firstDecision, firstDecision]);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', firstPostId), firstDecision);
scalarValues.set(profileHashKey + ':post:' + firstPostId, JSON.stringify(conflictingDecision));
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', firstPostId), firstDecision);
scalarValues.delete(profileHashKey + ':post:' + firstPostId);

const firstExpiry = hashExpirations.get(expiryKey(profileHashKey, firstPostId));
assert.equal(firstExpiry, now + 604_800_000);
now += 1_000;
const secondDecision = { decision: 'include', probability: 0.91 };
assert.deepEqual(await cacheNaturalLanguageMuteDecision('profile-a', 'post-b', secondDecision), secondDecision);
const secondExpiry = hashExpirations.get(expiryKey(profileHashKey, 'post-b'));
assert.equal(secondExpiry, now + 604_800_000);
assert.ok(secondExpiry > firstExpiry);
now += 1_000;
assert.deepEqual(await cacheNaturalLanguageMuteDecision('profile-a', firstPostId, conflictingDecision), firstDecision);
assert.equal(hashExpirations.get(expiryKey(profileHashKey, firstPostId)), firstExpiry);

hashValues.get(profileHashKey).set('post-invalid-json', '{');
hashValues.get(profileHashKey).set('post-missing-json', '');
const firstPage = await scanNaturalLanguageMuteDecisions('profile-a', '0', 1);
assert.ok(firstPage !== null);
assert.equal(firstPage.cursor, '23');
assert.deepEqual(Object.fromEntries(firstPage.entries.map(({ postId, decision }) => [postId, decision])), {
  [firstPostId]: firstDecision,
  'post-b': secondDecision,
  'post-invalid-json': null,
  'post-missing-json': null,
});
assert.equal(hashExpirations.get(expiryKey(profileHashKey, firstPostId)), firstExpiry);
const emptyContinuation = await scanNaturalLanguageMuteDecisions(
  'profile-a',
  '17',
  1,
);
assert.deepEqual(emptyContinuation, { cursor: '29', entries: [] });
const finishedPage = await scanNaturalLanguageMuteDecisions('profile-a', firstPage.cursor, 1);
assert.deepEqual(finishedPage, { cursor: '0', entries: [] });

const legacyProfileId = 'profile-legacy';
const legacyHashKey = cachePrefix + legacyProfileId;
const legacyPostId = 'post-legacy';
const legacyDecision = { decision: 'exclude', probability: 0.7 };
scalarValues.set(legacyHashKey + ':post:' + legacyPostId, JSON.stringify(legacyDecision));
assert.deepEqual(await getNaturalLanguageMuteDecision(legacyProfileId, legacyPostId), legacyDecision);
assert.equal(hashValues.has(legacyHashKey), false);
hashValues.set(legacyHashKey, new Map([
  ['post-invalid-hash', 'not JSON'],
  ['post-hash-only', JSON.stringify(legacyDecision)],
]));
scalarValues.set(
  legacyHashKey + ':post:post-invalid-hash',
  JSON.stringify({ decision: 'include', probability: 0.25 }),
);
assert.deepEqual(await getNaturalLanguageMuteDecision(legacyProfileId, 'post-invalid-hash'), {
  decision: 'include',
  probability: 0.25,
});
scalarValues.set(
  legacyHashKey + ':post:post-hash-only',
  JSON.stringify({ decision: 'include', probability: 0.25 }),
);
assert.deepEqual(await getNaturalLanguageMuteDecision(legacyProfileId, 'post-hash-only'), legacyDecision);
const legacyScan = await scanNaturalLanguageMuteDecisions(legacyProfileId, '0', 20);
assert.ok(legacyScan !== null);
assert.deepEqual(
  new Set(legacyScan.entries.map(({ postId }) => postId)),
  new Set(['post-invalid-hash', 'post-hash-only']),
);
for (const [postId, value] of [
  ['post-malformed', 'not JSON'],
  ['post-missing-probability', JSON.stringify({ decision: 'exclude' })],
  ['post-invalid-decision', JSON.stringify({ decision: 'skip', probability: 0.9 })],
  ['post-out-of-range', JSON.stringify({ decision: 'include', probability: 1.1 })],
]) {
  scalarValues.set(legacyHashKey + ':post:' + postId, value);
  assert.equal(await getNaturalLanguageMuteDecision(legacyProfileId, postId), null);
}

const unavailableDecision = { decision: 'include', probability: 0.4 };
redisAvailable = false;
assert.equal(await getNaturalLanguageMuteDecision('profile-unavailable', 'post-a'), null);
assert.equal(await scanNaturalLanguageMuteDecisions('profile-unavailable', '0', 20), null);
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-unavailable', 'post-unavailable', unavailableDecision),
  unavailableDecision,
);

redisAvailable = true;
scalarValues.set(
  cachePrefix + 'profile-error:post:post-a',
  JSON.stringify(firstDecision),
);
commandFails = true;
assert.equal(await getNaturalLanguageMuteDecision('profile-error', 'post-a'), null);
assert.equal(await scanNaturalLanguageMuteDecisions('profile-error', '0', 20), null);
const errorDecision = { decision: 'exclude', probability: 0.9 };
assert.deepEqual(await cacheNaturalLanguageMuteDecision('profile-error', 'post-error', errorDecision), errorDecision);
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

test(
  'scans every hash decision with Redis cursors and leaves scalar fallbacks unlisted',
  { skip: !process.env.KOSMO_TEST_REDIS_URL },
  async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = process.env.KOSMO_TEST_REDIS_URL;
    const { runRedisCommand } = await import('../redis/client.ts');
    const {
      cacheNaturalLanguageMuteDecision,
      getNaturalLanguageMuteDecision,
      scanNaturalLanguageMuteDecisions,
    } = await import('./natural-language-mute-cache.ts');
    const profileId = randomUUID();
    const firstPostId = randomUUID();
    const secondPostId = randomUUID();
    const legacyPostId = randomUUID();
    const key = `kosmo:home-timeline:natural-language-mute:profile:${profileId}`;
    const legacyKey = `${key}:post:${legacyPostId}`;

    try {
      const deadline = Date.now() + 5_000;
      let redisReady = false;
      while (Date.now() < deadline) {
        if ((await runRedisCommand((client) => client.ping()))?.value === 'PONG') {
          redisReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(redisReady, 'Redis test service did not become ready');

      const firstDecision = { decision: 'exclude', probability: 0.8 } as const;
      const secondDecision = { decision: 'include', probability: 0.2 } as const;
      await cacheNaturalLanguageMuteDecision(profileId, firstPostId, firstDecision);
      await runRedisCommand((client) => client.hExpire(key, [firstPostId], 60));
      const firstTtlBeforeConflict = (
        await runRedisCommand((client) => client.hTTL(key, [firstPostId]))
      )?.value?.[0];
      const conflictingDecision = { decision: 'include', probability: 0.9 } as const;
      assert.deepEqual(
        await cacheNaturalLanguageMuteDecision(profileId, firstPostId, conflictingDecision),
        firstDecision,
      );
      const firstTtlAfterConflict = (
        await runRedisCommand((client) => client.hTTL(key, [firstPostId]))
      )?.value?.[0];
      assert.ok(
        firstTtlBeforeConflict !== undefined &&
          firstTtlAfterConflict !== undefined &&
          firstTtlAfterConflict <= firstTtlBeforeConflict &&
          firstTtlAfterConflict > 50,
      );

      await cacheNaturalLanguageMuteDecision(profileId, secondPostId, secondDecision);
      const firstTtlBeforeScan = (
        await runRedisCommand((client) => client.hTTL(key, [firstPostId]))
      )?.value?.[0];
      const secondTtl = (await runRedisCommand((client) => client.hTTL(key, [secondPostId])))
        ?.value?.[0];
      assert.ok(
        firstTtlBeforeConflict !== undefined &&
          firstTtlBeforeScan !== undefined &&
          firstTtlBeforeScan <= firstTtlBeforeConflict &&
          firstTtlBeforeScan > 50,
      );
      assert.ok(secondTtl !== undefined && secondTtl > 604_790 && secondTtl <= 604_800);

      const legacyDecision = { decision: 'include', probability: 0.3 };
      await runRedisCommand((client) =>
        client.set(legacyKey, JSON.stringify(legacyDecision), { EX: 604_800 }),
      );
      assert.deepEqual(
        await getNaturalLanguageMuteDecision(profileId, legacyPostId),
        legacyDecision,
      );

      const entries = [];
      let cursor = '0';
      do {
        const page = await scanNaturalLanguageMuteDecisions(profileId, cursor, 1);
        assert.ok(page !== null);
        entries.push(...page.entries);
        cursor = page.cursor;
      } while (cursor !== '0');
      assert.deepEqual(
        Object.fromEntries(entries.map(({ postId, decision }) => [postId, decision])),
        { [firstPostId]: firstDecision, [secondPostId]: secondDecision },
      );
      const firstTtlAfterScan = (await runRedisCommand((client) => client.hTTL(key, [firstPostId])))
        ?.value?.[0];
      assert.ok(
        firstTtlBeforeScan !== undefined &&
          firstTtlAfterScan !== undefined &&
          firstTtlAfterScan <= firstTtlBeforeScan &&
          firstTtlAfterScan > 50,
      );
    } finally {
      await runRedisCommand((client) => client.unlink([key, legacyKey]));
      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  },
);
