import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('keeps first hash-field decisions for seven days and reads legacy values without migrating', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const hashValues = new Map();
const hashExpirations = new Map();
const scalarValues = new Map();
const commands = [];
let now = 1_000;
let redisAvailable = true;
let commandFails = false;
let scanReply = null;
const expiryKey = (key, field) => key + '\u0000' + field;
function currentHashValue(key, field) {
  const fieldKey = expiryKey(key, field);
  const expiresAt = hashExpirations.get(fieldKey);
  if (expiresAt !== undefined && expiresAt <= now) {
    hashValues.get(key)?.delete(field);
    hashExpirations.delete(fieldKey);
  }
  return hashValues.get(key)?.get(field) ?? null;
}
function currentScalarValue(key) {
  return scalarValues.get(key) ?? null;
}
const client = {
  async hGet(key, field) {
    commands.push({ command: 'hget', key, field });
    if (commandFails) throw new Error('Redis unavailable');
    return currentHashValue(key, field);
  },
  async get(key) {
    commands.push({ command: 'get', key });
    if (commandFails) throw new Error('Redis unavailable');
    return currentScalarValue(key);
  },
  async hSetEx(key, fields, options) {
    commands.push({ command: 'hsetex', key, fields, options });
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
  async hScan(key, cursor, options) {
    commands.push({ command: 'hscan', key, cursor, options });
    if (commandFails) throw new Error('Redis unavailable');
    if (scanReply !== null) return scanReply;
    const fields = [...(hashValues.get(key)?.keys() ?? [])];
    return {
      cursor: '0',
      entries: fields.flatMap((field) => {
        const value = currentHashValue(key, field);
        return value === null ? [] : [{ field, value }];
      }),
    };
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
  readNaturalLanguageMuteDecisionBatch,
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
assert.equal(scalarValues.has(profileHashKey + ':post:' + firstPostId), false);
scalarValues.set(
  profileHashKey + ':post:' + firstPostId,
  JSON.stringify(conflictingDecision),
);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', firstPostId), firstDecision);
scalarValues.delete(profileHashKey + ':post:' + firstPostId);

const firstExpiry = hashExpirations.get(expiryKey(profileHashKey, firstPostId));
assert.equal(firstExpiry, now + 604_800_000);
now += 1_000;
const secondDecision = { decision: 'include', probability: 0.91 };
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-b', secondDecision),
  secondDecision,
);
const secondExpiry = hashExpirations.get(expiryKey(profileHashKey, 'post-b'));
assert.equal(secondExpiry, now + 604_800_000);
assert.ok(secondExpiry > firstExpiry);
now += 1_000;
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', firstPostId), firstDecision);
const ttlBeforeBatch = hashExpirations.get(expiryKey(profileHashKey, firstPostId));
assert.deepEqual(await readNaturalLanguageMuteDecisionBatch('profile-a', '0'), {
  cursor: '0',
  entries: [
    { postId: firstPostId, decision: firstDecision },
    { postId: 'post-b', decision: secondDecision },
  ],
});
assert.equal(hashExpirations.get(expiryKey(profileHashKey, firstPostId)), ttlBeforeBatch);
assert.equal(ttlBeforeBatch, firstExpiry);

now = firstExpiry;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', firstPostId), null);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), secondDecision);
now = secondExpiry;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), null);

const legacyProfileId = 'profile-legacy';
const legacyHashKey = cachePrefix + legacyProfileId;
const legacyPostId = 'post-legacy';
const legacyKey = legacyHashKey + ':post:' + legacyPostId;
const legacyDecision = { decision: 'exclude', probability: 0.7 };
scalarValues.set(legacyKey, JSON.stringify(legacyDecision));
assert.deepEqual(await getNaturalLanguageMuteDecision(legacyProfileId, legacyPostId), legacyDecision);
assert.equal(hashValues.has(legacyHashKey), false);

const invalidHashPostId = 'post-invalid-hash';
hashValues.set(legacyHashKey, new Map([[invalidHashPostId, 'not JSON']]));
scalarValues.set(
  legacyHashKey + ':post:' + invalidHashPostId,
  JSON.stringify({ decision: 'include', probability: 0.25 }),
);
assert.deepEqual(await getNaturalLanguageMuteDecision(legacyProfileId, invalidHashPostId), {
  decision: 'include',
  probability: 0.25,
});
assert.equal(hashValues.get(legacyHashKey).get(invalidHashPostId), 'not JSON');

for (const [postId, value] of [
  ['post-malformed', 'not JSON'],
  ['post-missing-probability', JSON.stringify({ decision: 'exclude' })],
  ['post-invalid-decision', JSON.stringify({ decision: 'skip', probability: 0.9 })],
  ['post-out-of-range', JSON.stringify({ decision: 'include', probability: 1.1 })],
]) {
  scalarValues.set(legacyHashKey + ':post:' + postId, value);
  assert.equal(await getNaturalLanguageMuteDecision(legacyProfileId, postId), null);
}

const extraScanEntries = Array.from({ length: 18 }, (_, index) => ({
  field: 'post-extra-' + index,
  value: JSON.stringify(secondDecision),
}));
scanReply = {
  cursor: '23',
  entries: [
    { field: 'post-valid', value: JSON.stringify(firstDecision) },
    { field: 'post-malformed', value: '{' },
    { field: 'post-missing-probability', value: JSON.stringify({ decision: 'exclude' }) },
    { field: 'post-valid-extra', value: JSON.stringify(secondDecision) },
    ...extraScanEntries,
  ],
};
const scanCommandCount = commands.filter(({ command }) => command === 'hscan').length;
const batchEntries = await readNaturalLanguageMuteDecisionBatch('profile-batch', '17');
assert.deepEqual(batchEntries, {
  cursor: '23',
  entries: [
    { postId: 'post-valid', decision: firstDecision },
    { postId: 'post-malformed', decision: null },
    { postId: 'post-missing-probability', decision: null },
    { postId: 'post-valid-extra', decision: secondDecision },
    ...extraScanEntries.map(({ field }) => ({
      postId: field,
      decision: secondDecision,
    })),
  ],
});
assert.deepEqual(batchEntries?.entries.at(-1), {
  postId: 'post-extra-17',
  decision: secondDecision,
});
assert.equal(commands.filter(({ command }) => command === 'hscan').length, scanCommandCount + 1);
assert.deepEqual(commands.at(-1), {
  command: 'hscan',
  key: cachePrefix + 'profile-batch',
  cursor: '17',
  options: { COUNT: 20 },
});

const unavailableLegacyKey = cachePrefix + 'profile-unavailable:post:post-a';
scalarValues.set(unavailableLegacyKey, JSON.stringify(legacyDecision));
redisAvailable = false;
const commandCountBeforeUnavailableRead = commands.length;
assert.equal(await getNaturalLanguageMuteDecision('profile-unavailable', 'post-a'), null);
assert.equal(commands.length, commandCountBeforeUnavailableRead);
const unavailableDecision = { decision: 'include', probability: 0.4 };
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-unavailable', 'post-unavailable', unavailableDecision),
  unavailableDecision,
);

redisAvailable = true;
commandFails = true;
const failingLegacyKey = cachePrefix + 'profile-error:post:post-a';
scalarValues.set(failingLegacyKey, JSON.stringify(legacyDecision));
const commandCountBeforeErrorRead = commands.length;
assert.equal(await getNaturalLanguageMuteDecision('profile-error', 'post-a'), null);
assert.equal(commands.slice(commandCountBeforeErrorRead).some(({ command }) => command === 'get'), false);
const errorDecision = { decision: 'exclude', probability: 0.9 };
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-error', 'post-error', errorDecision),
  errorDecision,
);
assert.equal(commands.at(-1).command, 'hsetex');
assert.equal(await readNaturalLanguageMuteDecisionBatch('profile-error', '0'), null);
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
  'stores decisions in Redis hash fields with independent expiration',
  { skip: !process.env.KOSMO_TEST_REDIS_URL },
  async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = process.env.KOSMO_TEST_REDIS_URL;
    const { runRedisCommand } = await import('../redis/client.ts');
    const {
      cacheNaturalLanguageMuteDecision,
      getNaturalLanguageMuteDecision,
      readNaturalLanguageMuteDecisionBatch,
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
      const firstTtlBeforeSecondWrite = (
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
        firstTtlBeforeSecondWrite !== undefined &&
          firstTtlAfterConflict !== undefined &&
          firstTtlAfterConflict <= firstTtlBeforeSecondWrite &&
          firstTtlAfterConflict > 50,
      );
      await cacheNaturalLanguageMuteDecision(profileId, secondPostId, secondDecision);
      const firstTtlBeforeRead = (
        await runRedisCommand((client) => client.hTTL(key, [firstPostId]))
      )?.value?.[0];
      const secondTtl = (await runRedisCommand((client) => client.hTTL(key, [secondPostId])))
        ?.value?.[0];
      assert.ok(
        firstTtlBeforeSecondWrite !== undefined &&
          firstTtlBeforeRead !== undefined &&
          firstTtlBeforeRead <= firstTtlBeforeSecondWrite &&
          firstTtlBeforeRead > 50,
      );
      assert.ok(secondTtl !== undefined && secondTtl > 604_790 && secondTtl <= 604_800);

      assert.deepEqual(await getNaturalLanguageMuteDecision(profileId, firstPostId), firstDecision);
      assert.deepEqual(
        await getNaturalLanguageMuteDecision(profileId, secondPostId),
        secondDecision,
      );
      const batch = await readNaturalLanguageMuteDecisionBatch(profileId, '0');
      assert.ok(batch !== null && typeof batch.cursor === 'string');
      const firstTtlAfterRead = (await runRedisCommand((client) => client.hTTL(key, [firstPostId])))
        ?.value?.[0];
      assert.ok(
        firstTtlAfterRead !== undefined &&
          firstTtlAfterRead <= firstTtlBeforeRead &&
          firstTtlAfterRead > 50,
      );

      const legacyDecision = { decision: 'include', probability: 0.3 };
      await runRedisCommand((client) =>
        client.set(legacyKey, JSON.stringify(legacyDecision), { EX: 604_800 }),
      );
      assert.deepEqual(
        await getNaturalLanguageMuteDecision(profileId, legacyPostId),
        legacyDecision,
      );
      assert.equal(
        (await runRedisCommand((client) => client.hGet(key, legacyPostId)))?.value,
        null,
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
