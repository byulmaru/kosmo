import { ContentReportDeliveryStatus } from '@kosmo/core/enums';
import type { ContentReportInput } from './target';

export const CONTENT_REPORT_DELIVERY_TIMEOUT_MS = 5_000;

const slackWebhookPath = /^\/services\/[^/]+\/[^/]+\/[^/]+$/u;

const isSlackWebhookUrl = (value: string | undefined) => {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    url.origin === 'https://hooks.slack.com' &&
    !url.username &&
    !url.password &&
    slackWebhookPath.test(url.pathname) &&
    !url.search &&
    !url.hash
  );
};

const createPayload = ({ details, reason, target }: ContentReportInput) => ({
  details: details?.trim() || undefined,
  kosmoUrl: target.kosmoUrl,
  reason,
  remoteUri: target.remoteUri,
  targetId: target.id,
  targetType: target.kind,
});

export const deliverContentReport = async (
  input: ContentReportInput,
): Promise<ContentReportDeliveryStatus> => {
  const webhookUrl = process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL ?? '';
  if (!isSlackWebhookUrl(webhookUrl)) {
    return ContentReportDeliveryStatus.REJECTED;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTENT_REPORT_DELIVERY_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(webhookUrl, {
      body: JSON.stringify(createPayload(input)),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    });

    if (response.status !== 200) {
      return ContentReportDeliveryStatus.REJECTED;
    }

    return (await response.text()).trim() === 'ok'
      ? ContentReportDeliveryStatus.DELIVERED
      : ContentReportDeliveryStatus.REJECTED;
  } catch {
    return ContentReportDeliveryStatus.UNKNOWN;
  } finally {
    clearTimeout(timeout);
  }
};
