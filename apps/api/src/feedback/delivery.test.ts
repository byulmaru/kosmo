import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverFeedback, FEEDBACK_DELIVERY_TIMEOUT_MS } from './delivery';

const webhookUrl = 'https://hooks.slack.com/services/T000/B000/secret';
const validFeedback = {
  body: '  개선할 점이 있어요. <@U123> https://example.com  ',
  kind: 'FEATURE_REQUEST' as const,
};
let accountId: string;
let testSequence = 0;

test.beforeEach(() => {
  accountId = `account-${(testSequence += 1)}`;
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = webhookUrl;
});

test.afterEach(() => {
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
});

test('Slack에 안전한 plain-text payload를 한 번 전송한다', async (t) => {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  await deliverFeedback(accountId, validFeedback);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, webhookUrl);
  assert.deepEqual(await requests[0]?.json(), {
    blocks: [
      {
        text: { text: '새 Web 피드백', type: 'plain_text' },
        type: 'header',
      },
      {
        fields: [
          { text: '종류: 필요한 점', type: 'plain_text' },
          { text: '출처: Web', type: 'plain_text' },
        ],
        type: 'section',
      },
      {
        text: { text: validFeedback.body, type: 'plain_text' },
        type: 'section',
      },
    ],
    text: '새 Web 피드백',
    unfurl_links: false,
    unfurl_media: false,
  });
});

test('버그 피드백의 Sentry event ID는 payload에만 선택적으로 포함한다', async (t) => {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  await deliverFeedback(accountId, {
    body: '버그가 있어요.',
    kind: 'BUG_REPORT',
    sentryEventId: 'A'.repeat(32).toLowerCase(),
  });

  const payload = (await requests[0]?.json()) as { blocks: { fields?: { text: string }[] }[] };
  assert.equal(payload.blocks[3]?.fields?.[0]?.text, `Sentry event ID: ${'a'.repeat(32)}`);
});

test('webhook 설정이 없거나 Slack 전달이 실패하면 안전한 오류를 반환한다', async (t) => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    throw new Error('upstream detail must not escape');
  };

  t.mock.method(globalThis, 'fetch', fetch);
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://example.com/hook';
  await assert.rejects(deliverFeedback(accountId, validFeedback), /피드백을 전달할 수 없어요/u);
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = webhookUrl;
  await assert.rejects(deliverFeedback(accountId, validFeedback), /피드백을 전달하지 못했어요/u);
  assert.equal(calls, 1);
});

test('전송 실패는 자동 재시도하지 않고 명시적 재시도만 새 POST를 시작한다', async (t) => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  await assert.rejects(deliverFeedback(accountId, validFeedback));
  await assert.rejects(deliverFeedback(accountId, validFeedback));
  assert.equal(calls, 2);
});

test('전송 timeout은 abort 후 안전한 오류를 반환하고 in-flight를 해제한다', async (t) => {
  let calls = 0;
  const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls > 1) {
      return new Response(null, { status: 200 });
    }

    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  };

  t.mock.method(globalThis, 'fetch', fetch);
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const delivery = deliverFeedback(accountId, validFeedback);
  t.mock.timers.tick(FEEDBACK_DELIVERY_TIMEOUT_MS);
  await assert.rejects(delivery, /피드백을 전달하지 못했어요/u);
  assert.equal(calls, 1);

  await deliverFeedback(accountId, validFeedback);
  assert.equal(calls, 2);
});

test('완료된 같은 계정의 다음 전송을 허용한다', async (t) => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  await deliverFeedback(accountId, validFeedback);
  await deliverFeedback(accountId, validFeedback);

  assert.equal(calls, 2);
});

test('같은 계정의 in-flight 전송은 두 번째 POST를 시작하지 않는다', async (t) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    await pending;
    return new Response(null, { status: 200 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  const first = deliverFeedback(accountId, validFeedback);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(deliverFeedback(accountId, validFeedback), /처리 중이에요/u);
  release();
  await first;
  assert.equal(calls, 1);
});

test('서로 다른 계정의 in-flight 전송은 함께 진행할 수 있다', async (t) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    await pending;
    return new Response(null, { status: 200 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  const first = deliverFeedback(accountId, validFeedback);
  const second = deliverFeedback(`${accountId}-other`, validFeedback);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  release();
  await Promise.all([first, second]);
});
