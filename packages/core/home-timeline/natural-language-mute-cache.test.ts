import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('keeps the first final verdict per profile/post for seven days', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const values = new Map();
const expirations = new Map();
const commands = [];
let now = 1_000;
let redisAvailable = true;
let commandFails = false;
function currentValue(key) {
  const expiresAt = expirations.get(key);
  if (expiresAt !== undefined && expiresAt <= now) {
    values.delete(key);
    expirations.delete(key);
  }
  return values.get(key) ?? null;
}
const client = {
  async get(key) {
    commands.push({ command: 'get', key });
    if (commandFails) throw new Error('Redis unavailable');
    return currentValue(key);
  },
  async set(key, value, options) {
    commands.push({ command: 'set', key, value, options });
    if (commandFails) throw new Error('Redis unavailable');
    const previousValue = currentValue(key);
    if (options.NX && previousValue !== null) {
      return options.GET ? previousValue : null;
    }
    values.set(key, value);
    if (options.EX !== undefined) {
      expirations.set(key, now + options.EX * 1_000);
    }
    return options.GET ? null : 'OK';
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
} = await import('./natural-language-mute-cache.ts');

assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
const firstDecision = { decision: 'exclude', probability: 0.8 };
const conflictingDecision = { decision: 'include', probability: 0.79 };
const [firstConcurrent, secondConcurrent] = await Promise.all([
  cacheNaturalLanguageMuteDecision('profile-a', 'post-a', firstDecision),
  cacheNaturalLanguageMuteDecision('profile-a', 'post-a', conflictingDecision),
]);
assert.deepEqual([firstConcurrent, secondConcurrent], [firstDecision, firstDecision]);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), firstDecision);
assert.equal(await getNaturalLanguageMuteDecision('profile-b', 'post-a'), null);
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), null);
const firstSetCommand = commands.find((command) => command.command === 'set');
assert.ok(firstSetCommand);
const firstStoredValue = JSON.parse(firstSetCommand.value);
assert.deepEqual(firstStoredValue, firstDecision);
assert.deepEqual(firstSetCommand.options, { EX: 604800, GET: true, NX: true });
const firstExpiry = expirations.get(firstSetCommand.key);
assert.equal(firstExpiry, now + 604_800_000);

now += 1_000;
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-a', conflictingDecision),
  firstDecision,
);
assert.deepEqual(JSON.parse(values.get(firstSetCommand.key)), firstDecision);
assert.equal(expirations.get(firstSetCommand.key), firstExpiry);

// A cached verdict stays authoritative when a later threshold would classify its score differently.
const previousThresholdDecision = { decision: 'include', probability: 0.91 };
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-b', 'post-a', conflictingDecision),
  conflictingDecision,
);
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-b', previousThresholdDecision),
  previousThresholdDecision,
);
assert.deepEqual(
  await getNaturalLanguageMuteDecision('profile-b', 'post-a'),
  conflictingDecision,
);
assert.deepEqual(
  await getNaturalLanguageMuteDecision('profile-a', 'post-b'),
  previousThresholdDecision,
);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), firstDecision);

const invalidEntries = [
  ['post-legacy', 'exclude'],
  ['post-malformed', 'not JSON'],
  ['post-missing-probability', JSON.stringify({ decision: 'exclude' })],
  ['post-invalid-decision', JSON.stringify({ decision: 'skip', probability: 0.9 })],
  ['post-out-of-range', JSON.stringify({ decision: 'include', probability: 1.1 })],
];
for (const [postId, value] of invalidEntries) {
  const key = firstSetCommand.key.replace('post-a', postId);
  values.set(key, value);
  expirations.set(key, now + 86_400_000);
  const expiry = expirations.get(key);
  assert.equal(await getNaturalLanguageMuteDecision('profile-a', postId), null);
  const fallback = { decision: 'include', probability: 0.25 };
  assert.deepEqual(
    await cacheNaturalLanguageMuteDecision('profile-a', postId, fallback),
    fallback,
  );
  assert.equal(values.get(key), value);
  assert.equal(expirations.get(key), expiry);
}

redisAvailable = false;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
const unavailableDecision = { decision: 'include', probability: 0.4 };
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-unavailable', unavailableDecision),
  unavailableDecision,
);

redisAvailable = true;
commandFails = true;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
const errorDecision = { decision: 'exclude', probability: 0.9 };
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-error', errorDecision),
  errorDecision,
);
assert.equal(commands.at(-1).command, 'set');

commandFails = false;
now = firstExpiry;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-a', conflictingDecision),
  conflictingDecision,
);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), conflictingDecision);

const lostKey = firstSetCommand.key.replace('post-a', 'post-b');
values.delete(lostKey);
expirations.delete(lostKey);
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), null);
assert.deepEqual(
  await cacheNaturalLanguageMuteDecision('profile-a', 'post-b', conflictingDecision),
  conflictingDecision,
);
assert.deepEqual(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), conflictingDecision);
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
