import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Home timeline fanout retries Redis failures and accepts empty candidates and zero eval results', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { sql } from 'drizzle-orm';
import * as tables from '../db/tables.ts';

let redisCalls = 0;
let candidateQueries = 0;
let candidateRows = [];
let redisResponses = [];
let transactionResults = [];
let evalCalls = 0;

const client = {
  async ping() {
    return 'PONG';
  },
  multi() {
    const transaction = {
      eval() {
        evalCalls += 1;
        return transaction;
      },
      async exec() {
        return transactionResults.shift() ?? [];
      },
    };
    return transaction;
  },
};

mock.module(new URL('../redis/client.ts', import.meta.url), {
  exports: {
    runRedisCommand: async (command) => {
      redisCalls += 1;
      const response = redisResponses.shift();
      assert.ok(response, 'unexpected Redis command');
      if (response === 'unavailable') {
        return null;
      }
      return { value: await command(client) };
    },
  },
});

const db = {
  select() {
    const query = {
      from() {
        return this;
      },
      innerJoin() {
        return this;
      },
      where() {
        return this;
      },
      getSQL() {
        return sql.empty();
      },
      then(onFulfilled, onRejected) {
        candidateQueries += 1;
        return Promise.resolve(candidateRows).then(onFulfilled, onRejected);
      },
    };
    return query;
  },
};

mock.module(new URL('../db/index.ts', import.meta.url), {
  exports: { ...tables, db },
});

const { fanoutHomeTimelinePost } = await import('./cache.ts');
const postId = '550e8400-e29b-41d4-a716-446655440000';
const viewerId = 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f';
const reset = ({ rows = [], redis = [], transaction = [] } = {}) => {
  redisCalls = 0;
  candidateQueries = 0;
  candidateRows = rows;
  redisResponses = [...redis];
  transactionResults = [...transaction];
  evalCalls = 0;
};

for (const url of [undefined, '  ']) {
  reset();
  if (url === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = url;
  }
  await fanoutHomeTimelinePost({ postId });
  assert.equal(redisCalls, 0);
  assert.equal(candidateQueries, 0);
}

process.env.REDIS_URL = 'redis://mock';
reset({ redis: ['unavailable'] });
await assert.rejects(fanoutHomeTimelinePost({ postId }), Error);
assert.equal(redisCalls, 1);
assert.equal(candidateQueries, 0);

reset({ rows: [{ profileId: viewerId }], redis: ['ready', 'unavailable'] });
await assert.rejects(fanoutHomeTimelinePost({ postId }), Error);
assert.equal(redisCalls, 2);
assert.equal(candidateQueries, 1);

redisResponses.push('ready', 'ready');
transactionResults.push([0]);
await fanoutHomeTimelinePost({ postId });
assert.equal(redisCalls, 4);
assert.equal(candidateQueries, 2);
assert.equal(evalCalls, 1);

reset({ redis: ['ready'] });
await fanoutHomeTimelinePost({ postId });
assert.equal(redisCalls, 1);
assert.equal(candidateQueries, 1);
assert.equal(evalCalls, 0);
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

test('Home cache lifecycle writes fail on configured Redis outages and succeed on retry', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { sql } from 'drizzle-orm';
import * as tables from '../db/tables.ts';

let redisCalls = 0;
let failNextRedisCall = false;
let candidateRows = [];

const client = {
  async scan() {
    return { cursor: '0', keys: [] };
  },
  async zScore() {
    return null;
  },
  multi() {
    const results = [];
    const transaction = {
      eval() {
        results.push(() => 0);
        return transaction;
      },
      zRangeWithScores() {
        results.push(() => []);
        return transaction;
      },
      zScore() {
        results.push(() => -1);
        return transaction;
      },
      zRem() {
        results.push(() => 0);
        return transaction;
      },
      async exec() {
        return results.map((result) => result());
      },
    };
    return transaction;
  },
  async eval() {
    return 0;
  },
};

mock.module(new URL('../redis/client.ts', import.meta.url), {
  exports: {
    runRedisCommand: async (command) => {
      redisCalls += 1;
      if (failNextRedisCall) {
        failNextRedisCall = false;
        return null;
      }
      return { value: await command(client) };
    },
  },
});

const db = {
  select() {
    const query = {
      from() { return this; },
      innerJoin() { return this; },
      where() { return this; },
      orderBy() { return this; },
      limit() { return this; },
      getSQL() { return sql.empty(); },
      then(onFulfilled, onRejected) {
        return Promise.resolve(candidateRows).then(onFulfilled, onRejected);
      },
    };
    return query;
  },
};

mock.module(new URL('../db/index.ts', import.meta.url), {
  exports: { ...tables, db },
});

const {
  insertHomeTimelinePost,
  listHomeTimelineRecipientPage,
  reconcileHomeTimelineFollow,
  removeHomeTimelinePost,
  touchHomeTimeline,
} = await import('./cache.ts');
process.env.REDIS_URL = 'redis://mock';

const retryAfterRedisFailure = async (operation) => {
  failNextRedisCall = true;
  const callsBefore = redisCalls;
  await assert.rejects(operation(), Error);
  assert.ok(redisCalls > callsBefore, 'the failed attempt must reach Redis');
  const callsAfterFailure = redisCalls;
  await operation();
  assert.ok(redisCalls > callsAfterFailure, 'the retry must attempt Redis again');
};

await retryAfterRedisFailure(() => insertHomeTimelinePost({
  postId: '550e8400-e29b-41d4-a716-446655440000',
  profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f',
}));

candidateRows = [{ profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f' }];
await retryAfterRedisFailure(() => listHomeTimelineRecipientPage({
  postId: '550e8400-e29b-41d4-a716-446655440000',
}));

await retryAfterRedisFailure(() => removeHomeTimelinePost({
  postId: '550e8400-e29b-41d4-a716-446655440000',
}));

candidateRows = [];
await retryAfterRedisFailure(() => reconcileHomeTimelineFollow({
  profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f',
}));

failNextRedisCall = true;
await touchHomeTimeline({ profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f' });

const callsBeforeUnconfigured = redisCalls;
delete process.env.REDIS_URL;
await insertHomeTimelinePost({
  postId: '550e8400-e29b-41d4-a716-446655440000',
  profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f',
});
await touchHomeTimeline({ profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f' });
assert.deepEqual(await listHomeTimelineRecipientPage({
  postId: '550e8400-e29b-41d4-a716-446655440000',
}), { profileIds: [], nextCursor: null });
await removeHomeTimelinePost({ postId: '550e8400-e29b-41d4-a716-446655440000' });
await reconcileHomeTimelineFollow({ profileId: 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f' });
assert.equal(redisCalls, callsBeforeUnconfigured);
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
