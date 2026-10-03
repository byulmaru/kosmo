import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import type { executeGraphQLRequest as Execute } from './network';

let accountId: string | null = 'account-a';
const events: Array<[string, Record<string, unknown>]> = [];
mock.module(new URL('../analytics/client.ts', import.meta.url), {
  exports: {
    getAnalyticsAccountId: () => accountId,
    trackAnalytics: (name: string, properties: Record<string, unknown>) =>
      events.push([name, properties]),
  },
} as unknown as Parameters<typeof mock.module>[1]);
let execute: typeof Execute;
before(async () => {
  ({ executeGraphQLRequest: execute } = await import('./network'));
});
afterEach(() => {
  events.length = 0;
  accountId = 'account-a';
});
const request = {
  cacheID: 'test',
  id: null,
  metadata: {},
  name: 'HashtagRelatedProfilesPageQuery',
  operationKind: 'query' as const,
  text: 'query HashtagRelatedProfilesPageQuery($id: ID!) { node(id: $id) { id } }',
};
const response =
  (payload: object, status = 200) =>
  async () =>
    new Response(JSON.stringify(payload), { status });

for (const [payload, expected] of [
  [{ data: { node: { relatedProfiles: { edges: [] } } } }, 'success'],
  [{ data: { node: null } }, 'success'],
  [
    {
      data: { node: { relatedProfiles: { edges: [{ node: { id: 'profile-a', avatar: null } }] } } },
      errors: [
        {
          message: 'private details',
          path: ['node', 'relatedProfiles', 'edges', 0, 'node', 'avatar'],
        },
      ],
    },
    'partial',
  ],
  [
    {
      data: { node: null },
      errors: [{ message: 'private details', path: ['node', 'relatedProfiles'] }],
    },
    'failure',
  ],
  [{ data: null, errors: [{ message: 'private details' }] }, 'failure'],
  [{ errors: [{ message: 'private details' }] }, 'failure'],
] as const) {
  test(`GraphQL 결과를 ${expected}로 분류하고 원래 payload를 유지한다 ${JSON.stringify(payload.data)}`, async () => {
    assert.deepEqual(await execute(request, { id: 'opaque-a' }, null, response(payload)), payload);
    assert.deepEqual(events, [
      ['profile_hashtag_request_completed', { stage: 'initial', result: expected }],
    ]);
  });
}
test('background 실패와 retry 성공은 각각 한 요청이며 기존 failure를 지우지 않는다', async () => {
  await assert.rejects(
    execute(request, {}, null, async () => {
      throw new Error('offline');
    }),
  );
  await execute(
    request,
    {},
    null,
    response({ data: { node: { relatedProfiles: { edges: [] } } } }),
  );
  assert.deepEqual(
    events.map(([, properties]) => properties.result),
    ['failure', 'success'],
  );
});
test('HTTP/invalid JSON 실패는 원래 throw를 유지한다', async () => {
  await assert.rejects(
    execute(request, {}, null, response({ errors: [{ message: 'http failure' }] }, 503)),
    /http failure/,
  );
  await assert.rejects(
    execute(request, {}, null, async () => new Response('bad json')),
    /not JSON/,
  );
  assert.deepEqual(
    events.map(([, properties]) => properties.result),
    ['failure', 'failure'],
  );
});
test('pagination 요청과 initial refetch를 구분하고 다른 operation은 계측하지 않는다', async () => {
  const next = { ...request, name: 'HashtagRelatedProfilesNextPageQuery' };
  const fetcher = response({ data: { node: { relatedProfiles: { edges: [] } } } });
  await execute(next, { cursor: 'opaque-cursor' }, null, fetcher);
  await execute(next, { cursor: null }, null, fetcher);
  await execute({ ...request, name: 'ViewerQuery' }, {}, null, fetcher);
  assert.deepEqual(
    events.map(([, properties]) => properties.stage),
    ['pagination', 'initial'],
  );
});
test('늦은 Account A 요청은 B identity에 기록하지 않는다', async () => {
  await execute(request, {}, null, async () => {
    accountId = 'account-b';
    return new Response(JSON.stringify({ data: { node: null } }));
  });
  assert.deepEqual(events, []);
});

test('fetch 전에 실패한 operation 준비는 실제 완료 요청 분모에 넣지 않는다', async () => {
  const fetcher = response({ data: { node: null } });
  await assert.rejects(execute({ ...request, text: null }, {}, null, fetcher), /no query text/);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  await assert.rejects(execute(request, cyclic, null, fetcher), /circular/i);
  assert.deepEqual(events, []);
});
