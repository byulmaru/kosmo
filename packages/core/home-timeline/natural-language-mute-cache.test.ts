import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('keeps first hash-field decisions and pages indexed candidates without extending TTLs', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const hashValues = new Map();
const hashExpirations = new Map();
const scalarValues = new Map();
const indexValues = new Map();
let now = 1_000;
let redisAvailable = true;
let commandFails = false;
Date.now = () => now;

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
const matchesLexBoundary = (value, boundary, isMinimum) => {
  if (boundary === '-') return isMinimum;
  if (boundary === '+') return !isMinimum;
  const inclusive = boundary[0] === '[';
  const other = boundary.slice(1);
  return isMinimum
    ? inclusive ? value >= other : value > other
    : inclusive ? value <= other : value < other;
};
const inLexRange = (value, min, max) =>
  matchesLexBoundary(value, min, true) && matchesLexBoundary(value, max, false);
const indexMembers = (key) => [...(indexValues.get(key)?.keys() ?? [])].sort((a, b) =>
  a < b ? -1 : a > b ? 1 : 0,
);

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
  async hmGet(key, fields) {
    if (commandFails) throw new Error('Redis unavailable');
    return fields.map((field) => currentHashValue(key, field));
  },
  async zRemRangeByLex(key, min, max) {
    if (commandFails) throw new Error('Redis unavailable');
    const index = indexValues.get(key);
    if (!index) return 0;
    let removed = 0;
    for (const member of index.keys()) {
      if (inLexRange(member, min, max)) {
        index.delete(member);
        removed += 1;
      }
    }
    if (index.size === 0) {
      indexValues.delete(key);
    }
    return removed;
  },
  async zAdd(key, member, options) {
    if (commandFails) throw new Error('Redis unavailable');
    const index = indexValues.get(key) ?? new Map();
    if (options?.NX && index.has(member.value)) return 0;
    index.set(member.value, member.score);
    indexValues.set(key, index);
    return 1;
  },
  async expire(key) {
    if (commandFails) throw new Error('Redis unavailable');
    if (!indexValues.has(key)) return false;
    return true;
  },
  async zRangeByLex(key, min, max, options) {
    if (commandFails) throw new Error('Redis unavailable');
    const offset = options?.LIMIT?.offset ?? 0;
    const count = options?.LIMIT?.count ?? Infinity;
    return indexMembers(key).filter((member) => inLexRange(member, min, max)).slice(offset, offset + count);
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
  readNaturalLanguageMuteDecisionCandidates,
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
const ttlBeforeCandidateReads = hashExpirations.get(expiryKey(profileHashKey, firstPostId));
const firstPage = await readNaturalLanguageMuteDecisionCandidates('profile-a', { limit: 1 });
assert.deepEqual(firstPage?.map(({ postId, decision }) => ({ postId, decision })), [
  { postId: firstPostId, decision: firstDecision },
]);
assert.equal(hashExpirations.get(expiryKey(profileHashKey, firstPostId)), ttlBeforeCandidateReads);
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

const secondPage = await readNaturalLanguageMuteDecisionCandidates('profile-a', {
  after: firstPage?.[0]?.cursor,
  limit: 1,
});
assert.deepEqual(secondPage?.map(({ postId, decision }) => ({ postId, decision })), [
  { postId: 'post-b', decision: secondDecision },
]);
assert.deepEqual(
  await readNaturalLanguageMuteDecisionCandidates('profile-a', {
    after: secondPage?.[0]?.cursor,
    limit: 1,
  }),
  [],
);
assert.equal(hashExpirations.get(expiryKey(profileHashKey, firstPostId)), ttlBeforeCandidateReads);

const batchProfileId = 'profile-batch';
const batchPostIds = Array.from({ length: 23 }, (_, index) => 'post-batch-' + String(index).padStart(2, '0'));
for (const postId of batchPostIds) {
  await cacheNaturalLanguageMuteDecision(batchProfileId, postId, secondDecision);
}
const allCandidates = [];
let after;
while (true) {
  const page = await readNaturalLanguageMuteDecisionCandidates(batchProfileId, { after, limit: 4 });
  assert.notEqual(page, null);
  if (page.length === 0) break;
  allCandidates.push(...page);
  after = page.at(-1).cursor;
}
assert.equal(allCandidates.length, batchPostIds.length);
assert.deepEqual(
  new Set(allCandidates.map(({ postId }) => postId)),
  new Set(batchPostIds),
);

const damagedProfileId = 'profile-damaged';
await cacheNaturalLanguageMuteDecision(damagedProfileId, 'post-a-missing', firstDecision);
await cacheNaturalLanguageMuteDecision(damagedProfileId, 'post-b-invalid', secondDecision);
const damagedHash = hashValues.get(cachePrefix + damagedProfileId);
damagedHash.delete('post-a-missing');
damagedHash.set('post-b-invalid', '{');
const missingPage = await readNaturalLanguageMuteDecisionCandidates(damagedProfileId, { limit: 1 });
assert.deepEqual(missingPage?.map(({ postId, decision }) => ({ postId, decision })), [
  { postId: 'post-a-missing', decision: null },
]);
const invalidPage = await readNaturalLanguageMuteDecisionCandidates(damagedProfileId, {
  after: missingPage?.[0]?.cursor,
  limit: 1,
});
assert.deepEqual(invalidPage?.map(({ postId, decision }) => ({ postId, decision })), [
  { postId: 'post-b-invalid', decision: null },
]);
assert.deepEqual(
  await readNaturalLanguageMuteDecisionCandidates(damagedProfileId, {
    after: invalidPage?.[0]?.cursor,
    limit: 1,
  }),
  [],
);

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
assert.equal(hashValues.get(legacyHashKey).get('post-invalid-hash'), 'not JSON');
assert.deepEqual(await readNaturalLanguageMuteDecisionCandidates(legacyProfileId, { limit: 20 }), []);
for (const [postId, value] of [
  ['post-malformed', 'not JSON'],
  ['post-missing-probability', JSON.stringify({ decision: 'exclude' })],
  ['post-invalid-decision', JSON.stringify({ decision: 'skip', probability: 0.9 })],
  ['post-out-of-range', JSON.stringify({ decision: 'include', probability: 1.1 })],
]) {
  scalarValues.set(legacyHashKey + ':post:' + postId, value);
  assert.equal(await getNaturalLanguageMuteDecision(legacyProfileId, postId), null);
}

const pruneProfileId = 'profile-prune';
await cacheNaturalLanguageMuteDecision(pruneProfileId, 'post-a-expired', firstDecision);
const expiredAt = hashExpirations.get(expiryKey(cachePrefix + pruneProfileId, 'post-a-expired'));
now += 4 * 24 * 60 * 60 * 1_000;
await cacheNaturalLanguageMuteDecision(pruneProfileId, 'post-b-fresh', secondDecision);
const freshExpiry = hashExpirations.get(expiryKey(cachePrefix + pruneProfileId, 'post-b-fresh'));
now = expiredAt;
const beforePruneReadTtl = hashExpirations.get(expiryKey(cachePrefix + pruneProfileId, 'post-b-fresh'));
const prunedCandidates = await readNaturalLanguageMuteDecisionCandidates(pruneProfileId, { limit: 10 });
assert.deepEqual(prunedCandidates?.map(({ postId, decision }) => ({ postId, decision })), [
  { postId: 'post-b-fresh', decision: secondDecision },
]);
assert.equal(beforePruneReadTtl, freshExpiry);
assert.equal(hashExpirations.get(expiryKey(cachePrefix + pruneProfileId, 'post-b-fresh')), freshExpiry);

const unavailableDecision = { decision: 'include', probability: 0.4 };
redisAvailable = false;
assert.equal(await getNaturalLanguageMuteDecision('profile-unavailable', 'post-a'), null);
assert.equal(
  await readNaturalLanguageMuteDecisionCandidates('profile-unavailable', { limit: 20 }),
  null,
);
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
assert.equal(await readNaturalLanguageMuteDecisionCandidates('profile-error', { limit: 20 }), null);
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
  'stores indexed decisions in a lexicographically paged Redis set with independent hash expiration',
  { skip: !process.env.KOSMO_TEST_REDIS_URL },
  async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = process.env.KOSMO_TEST_REDIS_URL;
    const { runRedisCommand } = await import('../redis/client.ts');
    const {
      cacheNaturalLanguageMuteDecision,
      getNaturalLanguageMuteDecision,
      readNaturalLanguageMuteDecisionCandidates,
    } = await import('./natural-language-mute-cache.ts');
    const profileId = randomUUID();
    const firstPostId = randomUUID();
    const secondPostId = randomUUID();
    const legacyPostId = randomUUID();
    const key = `kosmo:home-timeline:natural-language-mute:profile:${profileId}`;
    const indexKey = `${key}:results`;
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
      const firstTtlBeforeRead = (
        await runRedisCommand((client) => client.hTTL(key, [firstPostId]))
      )?.value?.[0];
      const secondTtl = (await runRedisCommand((client) => client.hTTL(key, [secondPostId])))
        ?.value?.[0];
      assert.ok(
        firstTtlBeforeConflict !== undefined &&
          firstTtlBeforeRead !== undefined &&
          firstTtlBeforeRead <= firstTtlBeforeConflict &&
          firstTtlBeforeRead > 50,
      );
      assert.ok(secondTtl !== undefined && secondTtl > 604_790 && secondTtl <= 604_800);

      const firstPage = await readNaturalLanguageMuteDecisionCandidates(profileId, { limit: 1 });
      assert.ok(firstPage !== null && firstPage.length === 1);
      const secondPage = await readNaturalLanguageMuteDecisionCandidates(profileId, {
        after: firstPage[0]!.cursor,
        limit: 1,
      });
      assert.ok(secondPage !== null && secondPage.length === 1);
      assert.deepEqual(
        new Set([firstPage[0]!.postId, secondPage[0]!.postId]),
        new Set([firstPostId, secondPostId]),
      );
      assert.deepEqual(
        new Set([firstPage[0]!.decision, secondPage[0]!.decision]),
        new Set([firstDecision, secondDecision]),
      );
      const firstTtlAfterRead = (await runRedisCommand((client) => client.hTTL(key, [firstPostId])))
        ?.value?.[0];
      assert.ok(
        firstTtlBeforeRead !== undefined &&
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
      await runRedisCommand((client) => client.unlink([key, indexKey, legacyKey]));
      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  },
);
