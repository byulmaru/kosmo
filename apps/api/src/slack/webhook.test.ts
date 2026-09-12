import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSlackWebhookUrl, postSlackWebhook, SLACK_WEBHOOK_TIMEOUT_MS } from './webhook';

const webhookUrl = new URL('https://hooks.slack.com/services/T000/B000/secret');

test('Slack webhook URL은 canonical endpoint만 허용한다', () => {
  assert.equal(parseSlackWebhookUrl(webhookUrl.href)?.href, webhookUrl.href);

  for (const invalidUrl of [
    undefined,
    'not a URL',
    'http://hooks.slack.com/services/T000/B000/secret',
    'https://user:password@hooks.slack.com/services/T000/B000/secret',
    'https://hooks.slack.com:8443/services/T000/B000/secret',
    'https://hooks.slack.com.evil.example/services/T000/B000/secret',
    'https://hooks.slack.com/services/T000/B000',
    'https://hooks.slack.com/services/T000/B000/secret/extra',
    'https://hooks.slack.com/services/T000/B000/secret?redirect=evil',
    'https://hooks.slack.com/services/T000/B000/secret#fragment',
  ]) {
    assert.equal(parseSlackWebhookUrl(invalidUrl), null);
  }
});

test('Slack webhook transport는 공통 POST 옵션을 적용하고 미소비 응답을 정리한다', async (t) => {
  const requests: Request[] = [];
  let cancelCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('ignored'));
        },
        cancel() {
          cancelCalls += 1;
        },
      }),
      { status: 202 },
    );
  });

  const status = await postSlackWebhook(
    webhookUrl,
    { text: 'payload' },
    (response) => response.status,
  );

  assert.equal(status, 202);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, 'POST');
  assert.equal(requests[0]?.redirect, 'error');
  assert.equal(requests[0]?.headers.get('content-type'), 'application/json');
  assert.deepEqual(await requests[0]?.json(), { text: 'payload' });
  assert.equal(cancelCalls, 1);
});

test('Slack webhook transport는 parser를 우회한 URL도 거부한다', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });

  await assert.rejects(
    postSlackWebhook(new URL('https://evil.example/collect'), { text: 'payload' }, () => true),
    /Invalid Slack webhook URL/u,
  );
  assert.equal(calls, 0);
});

test('Slack webhook transport는 응답 정리가 멈춰도 결과 반환을 막지 않는다', async (t) => {
  let cancelCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    return {
      body: {
        cancel: async () => {
          cancelCalls += 1;
          return await new Promise<void>(() => undefined);
        },
      },
      bodyUsed: false,
      status: 202,
    } as unknown as Response;
  });

  const outcome = await Promise.race([
    postSlackWebhook(webhookUrl, { text: 'payload' }, (response) => response.status),
    new Promise<'still-pending'>((resolve) => setImmediate(() => resolve('still-pending'))),
  ]);

  assert.equal(outcome, 202);
  assert.equal(cancelCalls, 1);
});

test('Slack webhook transport는 응답 소비가 멈춰도 5초 후 중단한다', async (t) => {
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal;
    return {
      body: null,
      bodyUsed: false,
      text: async () =>
        await new Promise<string>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    } as unknown as Response;
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const delivery = postSlackWebhook(webhookUrl, { text: 'payload' }, (response) => response.text());
  await Promise.resolve();
  t.mock.timers.tick(SLACK_WEBHOOK_TIMEOUT_MS);

  await assert.rejects(delivery, /aborted/u);
  assert.equal(signal?.aborted, true);
});
