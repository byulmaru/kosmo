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
let publishedEvents = [];

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
      zScore() {
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

mock.module(new URL('./events.ts', import.meta.url), {
  exports: {
    publishHomeTimelinePostAdded: (event) => publishedEvents.push(event),
  },
});

const { fanoutHomeTimelinePost } = await import('./cache.ts');
const postId = '550e8400-e29b-41d4-a716-446655440000';
const viewerId = 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f';
const post = {
  id: postId,
  currentContentId: null,
  quoteConsentStatus: null,
  repostSourceId: null,
};
const reset = ({ rows = [], redis = [], transaction = [] } = {}) => {
  redisCalls = 0;
  candidateQueries = 0;
  candidateRows = rows;
  redisResponses = [...redis];
  transactionResults = [...transaction];
  evalCalls = 0;
  publishedEvents = [];
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

reset({ rows: [{ profileId: viewerId, post }], redis: ['ready', 'ready', 'unavailable'] });
await assert.rejects(fanoutHomeTimelinePost({ postId }), Error);

redisResponses.push('ready', 'ready', 'ready');
transactionResults.push([null], [0]);
await fanoutHomeTimelinePost({ postId });
assert.equal(evalCalls, 1);
assert.deepEqual(publishedEvents, []);

reset({
  rows: [{ profileId: viewerId, post }],
  redis: ['ready', 'ready'],
  transaction: [[25]],
});
await fanoutHomeTimelinePost({ postId });
assert.equal(evalCalls, 0);

reset({
  rows: [{ profileId: viewerId, post }],
  redis: ['ready', 'ready', 'ready'],
  transaction: [['invalid-score'], [0]],
});
await fanoutHomeTimelinePost({ postId });
assert.equal(evalCalls, 1);

reset({
  rows: [
    { profileId: viewerId, post },
    { profileId: 'a6b51e1e-cdae-4016-af05-224b6218e61d', post },
  ],
  redis: ['ready', 'ready', 'ready', 'ready'],
  transaction: [[null], [null], [1, 0]],
});
await fanoutHomeTimelinePost({ postId });
assert.equal(evalCalls, 2);
assert.deepEqual(publishedEvents, [{ postId, profileId: viewerId }]);

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
let failNextRedisCalls = 0;
let candidateRows = [];
let selectQueries = 0;
let evalResult = 0;
let publishedEvents = [];

const client = {
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
        results.push(() => null);
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
    return evalResult;
  },
};

mock.module(new URL('../redis/client.ts', import.meta.url), {
  exports: {
    runRedisCommand: async (command) => {
      redisCalls += 1;
      if (failNextRedisCalls > 0) {
        failNextRedisCalls -= 1;
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
        selectQueries += 1;
        return Promise.resolve(candidateRows).then(onFulfilled, onRejected);
      },
    };
    return query;
  },
};

mock.module(new URL('../db/index.ts', import.meta.url), {
  exports: { ...tables, db },
});

mock.module(new URL('./events.ts', import.meta.url), {
  exports: {
    publishHomeTimelinePostAdded: (event) => publishedEvents.push(event),
  },
});

const {
  insertHomeTimelinePost,
  listHomeTimelineRecipientPage,
  reconcileHomeTimelineFollow,
  removeHomeTimelinePost,
  touchHomeTimeline,
} = await import('./cache.ts');
process.env.REDIS_URL = 'redis://mock';

const postId = '550e8400-e29b-41d4-a716-446655440000';
const profileId = 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f';

for (const limit of [0, 1.5, 1_001]) {
  await assert.rejects(listHomeTimelineRecipientPage({ postId, limit }), RangeError);
}

const retryAfterRedisFailure = async (operation, failCount = 1) => {
  failNextRedisCalls = failCount;
  const callsBefore = redisCalls;
  await assert.rejects(operation(), Error);
  assert.ok(redisCalls > callsBefore, 'the failed attempt must reach Redis');
  const callsAfterFailure = redisCalls;
  await operation();
  assert.ok(redisCalls > callsAfterFailure, 'the retry must attempt Redis again');
};

candidateRows = [{ id: postId }];
await retryAfterRedisFailure(() => insertHomeTimelinePost({
  postId,
  profileId,
}), 2);

evalResult = 1;
publishedEvents = [];
await insertHomeTimelinePost({ postId, profileId });
assert.deepEqual(publishedEvents, [{ postId, profileId }]);

evalResult = 0;
await insertHomeTimelinePost({ postId, profileId });
assert.deepEqual(publishedEvents, [{ postId, profileId }]);

candidateRows = [];
await insertHomeTimelinePost({ postId, profileId });
assert.deepEqual(publishedEvents, [{ postId, profileId }]);

candidateRows = [{ profileId }];
const callsBeforeRecipientPage = redisCalls;
assert.deepEqual(await listHomeTimelineRecipientPage({
  postId,
}), {
  profileIds: [profileId],
  nextCursor: null,
});
assert.equal(redisCalls, callsBeforeRecipientPage);

await retryAfterRedisFailure(() => removeHomeTimelinePost({
  postId,
}));

candidateRows = [];
const selectQueriesBeforeEmptyReconcile = selectQueries;
await retryAfterRedisFailure(() => reconcileHomeTimelineFollow({
  profileId,
}));
assert.equal(selectQueries, selectQueriesBeforeEmptyReconcile);

failNextRedisCalls = 1;
await touchHomeTimeline({ profileId });

const callsBeforeUnconfigured = redisCalls;
delete process.env.REDIS_URL;
await insertHomeTimelinePost({
  postId,
  profileId,
});
await touchHomeTimeline({ profileId });
assert.deepEqual(await listHomeTimelineRecipientPage({
  postId,
}), { profileIds: [], nextCursor: null });
await removeHomeTimelinePost({ postId });
await reconcileHomeTimelineFollow({ profileId });
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

test('successful Home insertion survives a PubSub transport error', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { sql } from 'drizzle-orm';
import * as tables from '../db/tables.ts';

let evalCalls = 0;
const postId = '550e8400-e29b-41d4-a716-446655440000';
const profileId = 'a70d5412-1fb3-4ba3-8b07-6f9d2ee6764f';
const post = {
  id: postId,
  profileId,
  currentContentId: null,
  quoteConsentStatus: null,
  repostSourceId: null,
};

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
        return Promise.resolve([post]).then(onFulfilled, onRejected);
      },
    };
    return query;
  },
};

mock.module(new URL('../db/index.ts', import.meta.url), {
  exports: { ...tables, db },
});

const client = {
  multi() {
    const transaction = {
      zScore() { return transaction; },
      async exec() { return [null]; },
    };
    return transaction;
  },
  async eval() {
    evalCalls += 1;
    return 1;
  },
};

mock.module(new URL('../redis/client.ts', import.meta.url), {
  exports: {
    runRedisCommand: async (command) => ({ value: await command(client) }),
  },
});

mock.module(new URL('../redis/pubsub.ts', import.meta.url), {
  exports: {
    redisEventTarget: {
      addEventListener() {},
      dispatchEvent() { throw new Error('PubSub transport unavailable'); },
      removeEventListener() {},
    },
    disposeRedisPubSub() {},
  },
});

process.env.REDIS_URL = 'redis://mock';
const { insertHomeTimelinePost } = await import('./cache.ts');
await insertHomeTimelinePost({ postId, profileId });
assert.equal(evalCalls, 1);
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
