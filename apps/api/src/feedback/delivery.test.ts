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

const feedbackIdentity = () => ({
  accountId,
  profile: {
    displayName: '혜주',
    id: 'profile-1',
    relativeHandle: '@hyeju',
  },
});

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

  await deliverFeedback(feedbackIdentity(), validFeedback);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, webhookUrl);
  assert.deepEqual(await requests[0]?.json(), {
    blocks: [
      {
        text: { text: '새 피드백', type: 'plain_text' },
        type: 'header',
      },
      {
        fields: [
          { text: '종류: 필요한 점', type: 'plain_text' },
          { text: `Account ID: ${accountId}`, type: 'plain_text' },
          { text: '닉네임: 혜주', type: 'plain_text' },
          { text: 'Profile ID: profile-1', type: 'plain_text' },
          { text: 'Profile: @hyeju', type: 'plain_text' },
        ],
        type: 'section',
      },
      {
        text: { text: validFeedback.body, type: 'plain_text' },
        type: 'section',
      },
    ],
    text: '새 피드백 · 종류: 필요한 점',
    unfurl_links: false,
    unfurl_media: false,
  });
});

test('선택 Profile이 없으면 Account ID와 Profile 부재만 전달한다', async (t) => {
  let payload: unknown;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body));
    return new Response(null, { status: 200 });
  });

  await deliverFeedback({ accountId, profile: null }, validFeedback);

  assert.deepEqual(payload, {
    blocks: [
      {
        text: { text: '새 피드백', type: 'plain_text' },
        type: 'header',
      },
      {
        fields: [
          { text: '종류: 필요한 점', type: 'plain_text' },
          { text: `Account ID: ${accountId}`, type: 'plain_text' },
          { text: 'Profile: 선택된 프로필 없음', type: 'plain_text' },
        ],
        type: 'section',
      },
      {
        text: { text: validFeedback.body, type: 'plain_text' },
        type: 'section',
      },
    ],
    text: '새 피드백 · 종류: 필요한 점',
    unfurl_links: false,
    unfurl_media: false,
  });
});

test('webhook 설정이 없거나 Slack 전달이 실패하면 안전한 오류를 반환한다', async (t) => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    throw new Error('upstream detail must not escape');
  };

  t.mock.method(globalThis, 'fetch', fetch);
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://example.com/hook';
  await assert.rejects(
    deliverFeedback(feedbackIdentity(), validFeedback),
    /피드백을 전달할 수 없어요/u,
  );
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = webhookUrl;
  await assert.rejects(
    deliverFeedback(feedbackIdentity(), validFeedback),
    /피드백을 전달하지 못했어요/u,
  );
  assert.equal(calls, 1);
});

test('webhook URL은 canonical Slack origin과 userinfo만 허용한다', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });

  for (const invalidUrl of [
    'https://user:password@hooks.slack.com/services/T000/B000/secret',
    'https://hooks.slack.com:8443/services/T000/B000/secret',
    'https://hooks.slack.com.evil.example/services/T000/B000/secret',
  ]) {
    process.env.SLACK_FEEDBACK_WEBHOOK_URL = invalidUrl;
    await assert.rejects(
      deliverFeedback(feedbackIdentity(), validFeedback),
      /피드백을 전달할 수 없어요/u,
    );
  }

  assert.equal(calls, 0);
});

test('redirect 응답은 delivery failure이고 follow-up POST를 만들지 않는다', async (t) => {
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return Response.redirect('https://evil.example/collect', 307);
  });

  await assert.rejects(
    deliverFeedback(feedbackIdentity(), validFeedback),
    /피드백을 전달하지 못했어요/u,
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.redirect, 'error');
});

test('전송 실패는 자동 재시도하지 않고 명시적 재시도만 새 POST를 시작한다', async (t) => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  await assert.rejects(deliverFeedback(feedbackIdentity(), validFeedback));
  await assert.rejects(deliverFeedback(feedbackIdentity(), validFeedback));
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

  const delivery = deliverFeedback(feedbackIdentity(), validFeedback);
  t.mock.timers.tick(FEEDBACK_DELIVERY_TIMEOUT_MS);
  await assert.rejects(delivery, /피드백을 전달하지 못했어요/u);
  assert.equal(calls, 1);

  await deliverFeedback(feedbackIdentity(), validFeedback);
  assert.equal(calls, 2);
});

test('완료된 같은 계정의 다음 전송을 허용한다', async (t) => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  };

  t.mock.method(globalThis, 'fetch', fetch);

  await deliverFeedback(feedbackIdentity(), validFeedback);
  await deliverFeedback(feedbackIdentity(), validFeedback);

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

  const first = deliverFeedback(feedbackIdentity(), validFeedback);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(deliverFeedback(feedbackIdentity(), validFeedback), /처리 중이에요/u);
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

  const first = deliverFeedback(feedbackIdentity(), validFeedback);
  const second = deliverFeedback(
    { ...feedbackIdentity(), accountId: `${accountId}-other` },
    validFeedback,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  release();
  await Promise.all([first, second]);
});
