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
  delete process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL;
});

test('Content Report delivery sends only the confirmed target and reports Slack ACK', async () => {
  process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
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
    details: 'more context',
    kosmoUrl: target.kosmoUrl,
    reason: ContentReportReason.OTHER,
    remoteUri: target.remoteUri,
    targetId: target.id,
    targetType: target.kind,
  });
});

test('Content Report delivery classifies explicit Slack failures as rejected without retry', async () => {
  process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
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

test('Content Report delivery classifies timeout or response loss as unknown', async () => {
  process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = 'https://hooks.slack.com/services/a/b/c';
  globalThis.fetch = async () => {
    throw new TypeError('network unavailable');
  };

  const status = await deliverContentReport({
    reason: ContentReportReason.HARMFUL_CONTENT,
    target,
  });

  assert.equal(status, ContentReportDeliveryStatus.UNKNOWN);
});

test('Content Report delivery rejects an invalid webhook configuration before fetch', async () => {
  process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = 'https://example.com/report';
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
