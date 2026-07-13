import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { yoga } from './index';
import type { Env } from '../context';

const app = new Hono<Env>();

app.route('/graphql', yoga);

test('masks native OIDC session exchange variable values in GraphQL input errors', async () => {
  const accessToken = 'upstream-access-token';
  const idToken = 'upstream.id.token';
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      query: `
        mutation ExchangeNativeOidcSession($input: ExchangeNativeOidcSessionInput!) {
          exchangeNativeOidcSession(input: $input) {
            token
          }
        }
      `,
      variables: {
        input: {
          accessToken,
          idToken,
          redirectUri: 'kosmo://login/callback',
        },
      },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = (await response.json()) as {
    errors?: Array<{ extensions?: { code?: unknown }; message?: unknown }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.errors?.[0]?.message, 'Invalid input');
  assert.equal(body.errors?.[0]?.extensions?.code, 'VALIDATION');
  assert.equal(JSON.stringify(body).includes(accessToken), false);
  assert.equal(JSON.stringify(body).includes(idToken), false);
});
