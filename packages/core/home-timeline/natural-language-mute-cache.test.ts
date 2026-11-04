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
const [firstConcurrent, secondConcurrent] = await Promise.all([
  cacheNaturalLanguageMuteDecision('profile-a', 'post-a', 'exclude'),
  cacheNaturalLanguageMuteDecision('profile-a', 'post-a', 'include'),
]);
assert.deepEqual([firstConcurrent, secondConcurrent], ['exclude', 'exclude']);
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), 'exclude');
assert.equal(await getNaturalLanguageMuteDecision('profile-b', 'post-a'), null);
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), null);
const firstSetCommand = commands.find((command) => command.command === 'set');
assert.ok(firstSetCommand);
assert.equal(firstSetCommand.value, 'exclude');
assert.deepEqual(firstSetCommand.options, { EX: 604800, GET: true, NX: true });
const firstExpiry = expirations.get(firstSetCommand.key);
assert.equal(firstExpiry, now + 604_800_000);

now += 1_000;
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-a', 'include'), 'exclude');
assert.equal(values.get(firstSetCommand.key), 'exclude');
assert.equal(expirations.get(firstSetCommand.key), firstExpiry);

assert.equal(await cacheNaturalLanguageMuteDecision('profile-b', 'post-a', 'include'), 'include');
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-b', 'exclude'), 'exclude');
assert.equal(await getNaturalLanguageMuteDecision('profile-b', 'post-a'), 'include');
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), 'exclude');
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), 'exclude');

const corruptKey = firstSetCommand.key.replace('post-a', 'post-corrupt');
values.set(corruptKey, 'unknown');
expirations.set(corruptKey, now + 86_400_000);
const corruptExpiry = expirations.get(corruptKey);
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-corrupt'), null);
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-corrupt', 'include'), 'include');
assert.equal(values.get(corruptKey), 'unknown');
assert.equal(expirations.get(corruptKey), corruptExpiry);

redisAvailable = false;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-unavailable', 'include'), 'include');

redisAvailable = true;
commandFails = true;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-error', 'exclude'), 'exclude');
assert.equal(commands.at(-1).command, 'set');

commandFails = false;
now = firstExpiry;
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), null);
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-a', 'include'), 'include');
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-a'), 'include');

const lostKey = firstSetCommand.key.replace('post-a', 'post-b');
values.delete(lostKey);
expirations.delete(lostKey);
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), null);
assert.equal(await cacheNaturalLanguageMuteDecision('profile-a', 'post-b', 'include'), 'include');
assert.equal(await getNaturalLanguageMuteDecision('profile-a', 'post-b'), 'include');
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
