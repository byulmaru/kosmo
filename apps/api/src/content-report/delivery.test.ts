import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContentReportDeliveryStatus,
  ContentReportReason,
  ContentReportTargetType,
} from '@kosmo/core/enums';
import { deliverContentReport } from './delivery';
import type { ContentReportTarget } from './target';

const target: ContentReportTarget = {
  id: 'post-id',
  kind: ContentReportTargetType.POST,
  kosmoUrl: 'https://kosmo.example/@author/post-id',
  remoteUri: 'https://remote.example/objects/post-id',
};

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  delete process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL;
});

test('Content Report delivery sends a plain-text Slack payload and reports Slack ACK', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  let request: { body?: string; url?: string } = {};

  globalThis.fetch = async (input, init) => {
    request = {
      body: typeof init?.body === 'string' ? init.body : undefined,
      url: String(input),
    };
    return new Response('ok', { status: 200 });
  };

  const status = await deliverContentReport({
    details: '  more context  ',
    reason: ContentReportReason.OTHER,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.DELIVERED);
  assert.equal(request.url, 'https://hooks.slack.com/services/a/b/c');
  assert.deepEqual(JSON.parse(request.body ?? ''), {
    blocks: [
      {
        text: { text: '새 콘텐츠 신고', type: 'plain_text' },
        type: 'header',
      },
      {
        fields: [
          { text: `대상 종류: ${target.kind}`, type: 'plain_text' },
          { text: `대상 ID: ${target.id}`, type: 'plain_text' },
          { text: `Kosmo URL: ${target.kosmoUrl}`, type: 'plain_text' },
          { text: `Remote URI: ${target.remoteUri}`, type: 'plain_text' },
          { text: `신고 사유: ${ContentReportReason.OTHER}`, type: 'plain_text' },
        ],
        type: 'section',
      },
      {
        text: { text: '상세 내용: more context', type: 'plain_text' },
        type: 'section',
      },
    ],
    text: '새 콘텐츠 신고',
    unfurl_links: false,
    unfurl_media: false,
  });
});

test('Content Report delivery keeps a maximum-length detail in a plain-text section', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  let payload: unknown;
  globalThis.fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response('ok', { status: 200 });
  };

  const details = 'x'.repeat(2_000);
  const status = await deliverContentReport({
    details,
    reason: ContentReportReason.OTHER,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.DELIVERED);
  const detailsBlock = (
    payload as { blocks: Array<{ text?: { text?: string; type?: string } }> }
  ).blocks.at(-1);
  assert.deepEqual(detailsBlock, {
    text: { text: `상세 내용: ${details}`, type: 'plain_text' },
    type: 'section',
  });
  assert.ok((detailsBlock?.text?.text?.length ?? 0) <= 3_000);
});

test('Content Report delivery classifies explicit Slack failures as rejected without retry', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('invalid_payload', { status: 400 });
  };

  const status = await deliverContentReport({
    reason: ContentReportReason.SPAM_FRAUD,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.REJECTED);
  assert.equal(calls, 1);
});

test('Content Report delivery requires HTTP 200 and an ok ACK', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  let calls = 0;
  let response = new Response('ok', { status: 201 });
  globalThis.fetch = async () => {
    calls += 1;
    return response;
  };

  const input = {
    reason: ContentReportReason.SPAM_FRAUD,
    target,
  };
  assert.equal(await deliverContentReport(input), ContentReportDeliveryStatus.REJECTED);

  response = new Response('not ok', { status: 200 });
  assert.equal(await deliverContentReport(input), ContentReportDeliveryStatus.REJECTED);
  assert.equal(calls, 2);
});

test('Content Report delivery classifies timeout or response loss as unknown', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  globalThis.fetch = async () => {
    throw new TypeError('network unavailable');
  };

  const status = await deliverContentReport({
    reason: ContentReportReason.HARMFUL_CONTENT,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.UNKNOWN);
});

test('Content Report delivery classifies response body read failures as unknown without retry', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      status: 200,
      text: async () => {
        throw new TypeError('response body unavailable');
      },
    } as unknown as Response;
  };

  const status = await deliverContentReport({
    reason: ContentReportReason.HARMFUL_CONTENT,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.UNKNOWN);
  assert.equal(calls, 1);
});

test('Content Report delivery rejects a missing shared webhook configuration before fetch', async () => {
  process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  };

  const status = await deliverContentReport({
    reason: ContentReportReason.HARASSMENT_HATE_THREAT,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.REJECTED);
  assert.equal(calls, 0);
});

test('Content Report delivery rejects an invalid shared webhook configuration before fetch', async () => {
  process.env.SLACK_FEEDBACK_WEBHOOK_URL = 'https://example.com/report';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  };

  const status = await deliverContentReport({
    reason: ContentReportReason.HARASSMENT_HATE_THREAT,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.REJECTED);
  assert.equal(calls, 0);
});
