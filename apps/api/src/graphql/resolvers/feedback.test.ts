import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql, isEnumType, isInputObjectType, isObjectType } from 'graphql';
import { schema } from '../../graphql/schema';

const webhookUrl = 'https://hooks.slack.com/services/T000/B000/secret';
const mutation = `
  mutation SubmitFeedback($input: SubmitFeedbackInput!) {
    submitFeedback(input: $input) {
      completed
    }
  }
`;
let accountId: string;
let testSequence = 0;

test.beforeEach(() => {
  accountId = `account-${(testSequence += 1)}`;
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = webhookUrl;
});

test.afterEach(() => {
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
});

test('schema에 login-scoped feedback mutation contract를 제공한다', () => {
  const mutationFields = schema.getMutationType()?.getFields();
  const input = schema.getType('SubmitFeedbackInput');
  const payload = schema.getType('SubmitFeedbackPayload');
  const kind = schema.getType('FeedbackKind');

  assert.ok(mutationFields?.submitFeedback);
  assert.equal(String(mutationFields.submitFeedback.type), 'SubmitFeedbackPayload!');
  assert.ok(isInputObjectType(input));
  assert.deepEqual(Object.keys(input.getFields()).sort(), ['body', 'kind']);
  assert.equal(String(input.getFields().body.type), 'String!');
  assert.equal(String(input.getFields().kind.type), 'FeedbackKind!');
  assert.ok(isObjectType(payload));
  assert.equal(String(payload.getFields().completed.type), 'Boolean!');
  assert.ok(isEnumType(kind));
  assert.deepEqual(
    kind
      .getValues()
      .map((value) => value.name)
      .sort(),
    ['BUG_REPORT', 'FEATURE_REQUEST', 'NEGATIVE', 'POSITIVE'],
  );
});

test('선택 Profile이 없는 login session도 feedback을 제출할 수 있다', async () => {
  const fetch = async () => new Response(null, { status: 200 });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetch;

  try {
    const result = await graphql({
      contextValue: { session: { accountId, id: 'session-1', profileId: null } },
      schema,
      source: mutation,
      variableValues: {
        input: { body: '  도움이 됐어요.  ', kind: 'POSITIVE' },
      },
    });

    assert.equal(result.errors, undefined);
    assert.equal(
      (result.data as { submitFeedback?: { completed?: boolean } }).submitFeedback?.completed,
      true,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('anonymous와 invalid body는 Slack 전에 거부한다', async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  };

  try {
    const anonymous = await graphql({
      contextValue: {},
      schema,
      source: mutation,
      variableValues: { input: { body: 'body', kind: 'POSITIVE' } },
    });
    const empty = await graphql({
      contextValue: { session: { accountId, id: 'session-1', profileId: null } },
      schema,
      source: mutation,
      variableValues: { input: { body: '   ', kind: 'POSITIVE' } },
    });
    assert.equal(anonymous.errors?.length, 1);
    assert.equal(empty.errors?.length, 1);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
