import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { yoga } from './index';
import type { Env } from '../context';

const app = new Hono<Env>();

app.route('/graphql', yoga);

const requestGraphQL = async (body: Record<string, unknown>) => {
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  return {
    body: (await response.json()) as {
      errors?: Array<{ extensions?: { code?: unknown }; message?: unknown }>;
    },
    response,
  };
};

const assertMaskedValidationError = (
  response: Response,
  body: { errors?: Array<{ extensions?: { code?: unknown }; message?: unknown }> },
  secrets: readonly string[],
) => {
  assert.equal(response.status, 200);
  assert.equal(body.errors?.[0]?.message, 'Invalid input');
  assert.equal(body.errors?.[0]?.extensions?.code, 'VALIDATION');
  for (const secret of secrets) {
    assert.equal(JSON.stringify(body).includes(secret), false);
  }
};

test('masks GraphQL variable coercion values in production', async () => {
  const code = 'authorization-code-secret';
  const { body, response } = await requestGraphQL({
    query: `
      mutation ExchangeNativeOidcSession($input: ExchangeNativeOidcSessionInput!) {
        exchangeNativeOidcSession(input: $input) {
          token
        }
      }
    `,
    variables: {
      input: {
        code: [code],
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'kosmo://login/callback',
      },
    },
  });

  assertMaskedValidationError(response, body, [code]);
});

test('masks GraphQL validation literals in production', async () => {
  const accessToken = 'inline-access-token-secret';
  const idToken = 'inline.id.token.secret';
  const { body, response } = await requestGraphQL({
    query: `
      mutation {
        exchangeNativeOidcSession(
          input: {
            code: "authorization-code"
            codeVerifier: "${'v'.repeat(43)}"
            redirectUri: "kosmo://login/callback"
            accessToken: "${accessToken}"
            idToken: "${idToken}"
          }
        ) {
          token
        }
      }
    `,
  });

  assertMaskedValidationError(response, body, [accessToken, idToken]);
});

test('uses the same production validation contract for other operations', async () => {
  const { body, response } = await requestGraphQL({ query: 'query { notAQueryField }' });

  assertMaskedValidationError(response, body, ['notAQueryField']);
});
