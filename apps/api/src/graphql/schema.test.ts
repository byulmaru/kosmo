import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql, isInputObjectType, isObjectType } from 'graphql';
import { schema } from './schema';

test('exposes the Plain Text post contract without TipTap', () => {
  const postContent = schema.getType('PostContent');
  const createPostInput = schema.getType('CreatePostInput');

  assert.ok(isObjectType(postContent));
  assert.ok(postContent.getFields().contentWarning);
  assert.equal(postContent.getFields().spoilerText, undefined);
  assert.equal(postContent.getFields().bodyJson, undefined);

  assert.ok(isInputObjectType(createPostInput));
  assert.equal(createPostInput.getFields().content, undefined);
  assert.equal(String(createPostInput.getFields().bodyText?.type), 'String!');
  assert.equal(schema.getType('TipTapDocument'), undefined);
});

test('rejects empty and over-500-character Plain Text before creating a post', async () => {
  for (const [bodyText, message] of [
    [' \n ', '본문을 입력해주세요.'],
    ['가'.repeat(501), '본문은 500자까지 작성할 수 있어요.'],
  ] as const) {
    const result = await graphql({
      schema,
      source: `
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            post { id }
          }
        }
      `,
      variableValues: { input: { bodyText, visibility: 'UNLISTED' } },
      contextValue: { session: { profileId: '00000000-0000-8000-8000-000000000001' } },
    });

    assert.equal(result.data == null, true);
    assert.equal(result.errors?.[0]?.message, message);
  }
});

test('exposes the unauthenticated native OIDC session exchange mutation', () => {
  const mutation = schema.getMutationType();
  const input = schema.getType('ExchangeNativeOidcSessionInput');
  const payload = schema.getType('ExchangeNativeOidcSessionPayload');

  assert.ok(mutation?.getFields().exchangeNativeOidcSession);
  assert.ok(isInputObjectType(input));
  assert.equal(String(input.getFields().code?.type), 'String!');
  assert.equal(String(input.getFields().codeVerifier?.type), 'String!');
  assert.equal(String(input.getFields().redirectUri?.type), 'String!');
  assert.ok(isObjectType(payload));
  assert.equal(String(payload.getFields().token?.type), 'String!');
});

test('rejects malformed native OIDC session exchange input before an OIDC exchange', async () => {
  const result = await graphql({
    schema,
    source: `
      mutation ExchangeNativeOidcSession($input: ExchangeNativeOidcSessionInput!) {
        exchangeNativeOidcSession(input: $input) {
          token
        }
      }
    `,
    variableValues: {
      input: {
        code: 'authorization-code',
        codeVerifier: 'too-short',
        redirectUri: 'https://evil.example/login/callback',
      },
    },
  });

  assert.equal(result.data == null, true);
  assert.equal(result.errors?.[0]?.message, 'Invalid input');
});

test('does not accept raw upstream token fields for native OIDC session exchange', async () => {
  const result = await graphql({
    schema,
    source: `
      mutation ExchangeNativeOidcSession($input: ExchangeNativeOidcSessionInput!) {
        exchangeNativeOidcSession(input: $input) {
          token
        }
      }
    `,
    variableValues: {
      input: {
        accessToken: 'upstream-access-token',
        code: 'authorization-code',
        codeVerifier: 'v'.repeat(43),
        idToken: 'upstream.id.token',
        redirectUri: 'kosmo://login/callback',
      },
    },
  });

  assert.equal(result.data == null, true);
  assert.match(result.errors?.[0]?.message ?? '', /Field .* is not defined/);
});
