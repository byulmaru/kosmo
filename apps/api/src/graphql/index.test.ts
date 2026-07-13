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

test('masks native OIDC session exchange inline credential literals in GraphQL validation errors', async () => {
  for (const [input, secrets] of [
    [
      `code: ["inline-code-secret"], codeVerifier: "${'v'.repeat(43)}", redirectUri: "kosmo://login/callback"`,
      ['inline-code-secret'],
    ],
    [
      `code: "authorization-code", codeVerifier: ["inline-verifier-secret"], redirectUri: "kosmo://login/callback"`,
      ['inline-verifier-secret'],
    ],
    [
      `code: "authorization-code", codeVerifier: "${'v'.repeat(43)}", redirectUri: "kosmo://login/callback", accessToken: "inline-access-token", idToken: "inline.id.token"`,
      ['inline-access-token', 'inline.id.token'],
    ],
  ] as const) {
    const response = await app.request('http://api.kosmo.example/graphql', {
      body: JSON.stringify({
        query: `
          mutation {
            exchangeNativeOidcSession(input: { ${input} }) {
              token
            }
          }
        `,
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
    for (const secret of secrets) {
      assert.equal(JSON.stringify(body).includes(secret), false);
    }
  }
});

test('masks native OIDC session exchange input variable defaults in GraphQL validation errors', async () => {
  const code = 'default-code-secret';
  const accessToken = 'default-access-token';
  const idToken = 'default.id.token';
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      query: `
        mutation NativeOidcSessionExchange(
          $input: ExchangeNativeOidcSessionInput! = {
            code: ["${code}"]
            codeVerifier: "${'v'.repeat(43)}"
            redirectUri: "kosmo://login/callback"
            accessToken: "${accessToken}"
            idToken: "${idToken}"
          }
        ) {
          exchangeNativeOidcSession(input: $input) {
            token
          }
        }
      `,
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
  assert.equal(JSON.stringify(body).includes(code), false);
  assert.equal(JSON.stringify(body).includes(accessToken), false);
  assert.equal(JSON.stringify(body).includes(idToken), false);
});

test('masks variables nested in native OIDC session exchange input', async () => {
  const code = 'per-field-code-secret';
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      query: `
        mutation NativeOidcSessionExchange(
          $code: String!
          $codeVerifier: String!
          $redirectUri: String!
        ) {
          exchangeNativeOidcSession(
            input: {
              code: $code
              codeVerifier: $codeVerifier
              redirectUri: $redirectUri
            }
          ) {
            token
          }
        }
      `,
      variables: {
        code: [code],
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'kosmo://login/callback',
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
  assert.equal(JSON.stringify(body).includes(code), false);
});

test('masks native OIDC session exchange variables referenced through fragments', async () => {
  const code = 'fragment-code-secret';
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      query: `
        mutation NativeOidcSessionExchange($input: ExchangeNativeOidcSessionInput!) {
          ...NativeOidcSessionExchange
        }

        fragment NativeOidcSessionExchange on Mutation {
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
  assert.equal(JSON.stringify(body).includes(code), false);
});

test('treats variables referenced from unused native OIDC session exchange fragments as sensitive', async () => {
  const inputCode = 'unused-fragment-input-secret';
  const fieldCode = 'unused-fragment-field-secret';
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      operationName: 'Other',
      query: `
        mutation Other(
          $input: ExchangeNativeOidcSessionInput! = {
            code: ["${inputCode}"]
            codeVerifier: "${'v'.repeat(43)}"
            redirectUri: "kosmo://login/callback"
          }
          $code: String! = ["${fieldCode}"]
          $codeVerifier: String! = "${'v'.repeat(43)}"
          $redirectUri: String! = "kosmo://login/callback"
        ) {
          __typename
        }

        fragment NativeInput on Mutation {
          exchangeNativeOidcSession(input: $input) {
            token
          }
        }

        fragment NativeFields on Mutation {
          exchangeNativeOidcSession(
            input: {
              code: $code
              codeVerifier: $codeVerifier
              redirectUri: $redirectUri
            }
          ) {
            token
          }
        }
      `,
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
  assert.equal(JSON.stringify(body).includes(inputCode), false);
  assert.equal(JSON.stringify(body).includes(fieldCode), false);
});

test('preserves GraphQL validation diagnostics outside native OIDC session exchange', async () => {
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({ query: 'query { notAQueryField }' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = (await response.json()) as {
    errors?: Array<{ message?: string }>;
  };

  assert.equal(response.status, 200);
  assert.match(body.errors?.[0]?.message ?? '', /Cannot query field "notAQueryField"/);
});

test('preserves other operation diagnostics in a document with native OIDC session exchange', async () => {
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      operationName: 'Other',
      query: `
        query Other {
          notAQueryField
        }

        mutation NativeOidcSessionExchange {
          exchangeNativeOidcSession(
            input: {
              code: "authorization-code"
              codeVerifier: "${'v'.repeat(43)}"
              redirectUri: "kosmo://login/callback"
            }
          ) {
            token
          }
        }
      `,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = (await response.json()) as {
    errors?: Array<{ message?: string }>;
  };

  assert.equal(response.status, 200);
  assert.match(body.errors?.[0]?.message ?? '', /Cannot query field "notAQueryField"/);
});

test('does not classify other operation variable coercion as native OIDC input', async () => {
  const response = await app.request('http://api.kosmo.example/graphql', {
    body: JSON.stringify({
      operationName: 'Other',
      query: `
        query Other($value: Boolean!) {
          __typename @skip(if: $value)
        }

        mutation NativeOidcSessionExchange {
          exchangeNativeOidcSession(
            input: {
              code: "authorization-code"
              codeVerifier: "${'v'.repeat(43)}"
              redirectUri: "kosmo://login/callback"
            }
          ) {
            token
          }
        }
      `,
      variables: { value: ['not-a-boolean'] },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = (await response.json()) as {
    errors?: Array<{ extensions?: { code?: unknown }; message?: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.errors?.[0]?.message, 'Unexpected error');
  assert.equal(body.errors?.[0]?.extensions?.code, 'INTERNAL_SERVER_ERROR');
});
