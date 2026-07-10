import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] ?? 'http://kosmo-web-smoke:8080');

async function request(path, init, expectedStatus) {
  const response = await fetch(new URL(path, origin), { redirect: 'manual', ...init });
  const body = await response.text();

  assert.equal(response.status, expectedStatus, `${path}: ${response.status} ${body}`);
  return { body, headers: response.headers };
}

for (let attempt = 0; ; attempt += 1) {
  try {
    await request('/health', undefined, 200);
    break;
  }
  catch (error) {
    if (attempt === 59) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const root = await request('/', undefined, 200);
assert.match(root.headers.get('content-type') ?? '', /^text\/html/);
assert.match(root.body, /id=["']root["']/);

const deepLink = await request('/@smoke/post-id', undefined, 200);
assert.match(deepLink.body, /id=["']root["']/);

const graphQL = await request(
  '/graphql',
  {
    body: JSON.stringify({
      operationName: 'ContainerSmokeQuery',
      query: 'query ContainerSmokeQuery { __typename }',
      variables: {},
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  },
  200,
);
assert.deepEqual(JSON.parse(graphQL.body), {
  data: { __typename: 'Query', receivedOperationName: 'ContainerSmokeQuery' },
});

const login = await request('/login', undefined, 302);
assert.match(login.headers.get('location') ?? '', /^http:\/\/kosmo-oidc-smoke\/oauth\/authorize\?/);

await request('/login/callback', undefined, 400);
await request(
  '/login/native/session',
  {
    body: '{}',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  },
  400,
);
await request('/.well-known/webfinger', undefined, 400);
await request('/ap/not-an-actor', undefined, 404);
