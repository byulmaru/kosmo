import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverFeedback, FEEDBACK_RATE_LIMIT, resetFeedbackDeliveryState } from './delivery';

const webhookUrl = 'https://hooks.slack.com/services/T000/B000/secret';
const validFeedback = {
  body: '  개선할 점이 있어요. <@U123> https://example.com  ',
  kind: 'FEATURE_REQUEST' as const,
};

test.beforeEach(() => {
  resetFeedbackDeliveryState();
});

test('Slack에 안전한 plain-text payload를 한 번 전송한다', async () => {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  };

  await deliverFeedback('account-1', validFeedback, { fetch, webhookUrl });

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

test('버그 피드백의 Sentry event ID는 payload에만 선택적으로 포함한다', async () => {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  };

  await deliverFeedback(
    'account-1',
    { body: '버그가 있어요.', kind: 'BUG_REPORT', sentryEventId: 'A'.repeat(32).toLowerCase() },
    { fetch, webhookUrl },
  );

  const payload = (await requests[0]?.json()) as { blocks: { fields?: { text: string }[] }[] };
  assert.equal(payload.blocks[3]?.fields?.[0]?.text, `Sentry event ID: ${'a'.repeat(32)}`);
});

test('webhook 설정이 없거나 Slack 전달이 실패하면 안전한 오류를 반환한다', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    throw new Error('upstream detail must not escape');
  };

  await assert.rejects(
    deliverFeedback('account-1', validFeedback, { webhookUrl: 'https://example.com/hook' }),
    /피드백을 전달할 수 없어요/u,
  );
  await assert.rejects(
    deliverFeedback('account-1', validFeedback, { fetch, webhookUrl }),
    /피드백을 전달하지 못했어요/u,
  );
  assert.equal(calls, 1);
});

test('전송 실패는 자동 재시도하지 않고 명시적 재시도만 새 POST를 시작한다', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  };

  await assert.rejects(deliverFeedback('account-1', validFeedback, { fetch, webhookUrl }));
  await assert.rejects(deliverFeedback('account-1', validFeedback, { fetch, webhookUrl }));
  assert.equal(calls, 2);
});

test('계정별 10분 fixed window에서 다섯 번만 시도할 수 있다', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  };

  for (let attempt = 0; attempt < FEEDBACK_RATE_LIMIT; attempt += 1) {
    await deliverFeedback('account-1', validFeedback, { fetch, webhookUrl });
  }

  await assert.rejects(
    deliverFeedback('account-1', validFeedback, { fetch, webhookUrl }),
    /너무 많이 보냈어요/u,
  );
  assert.equal(calls, FEEDBACK_RATE_LIMIT);
});

test('같은 계정의 in-flight 전송은 두 번째 POST를 시작하지 않는다', async () => {
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

  const first = deliverFeedback('account-1', validFeedback, { fetch, webhookUrl });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    deliverFeedback('account-1', validFeedback, { fetch, webhookUrl }),
    /처리 중이에요/u,
  );
  release();
  await first;
  assert.equal(calls, 1);
});
