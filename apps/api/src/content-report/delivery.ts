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
        { text: `Remote URI: ${target.remoteUri ?? '없음'}`, type: 'plain_text' },
        { text: `신고 사유: ${reason}`, type: 'plain_text' },
      ],
      type: 'section',
    },
    {
      text: { text: `상세 내용: ${details?.trim() || '없음'}`, type: 'plain_text' },
      type: 'section',
    },
  ],
  text: '새 콘텐츠 신고',
  unfurl_links: false,
  unfurl_media: false,
});

export const deliverContentReport = async (
  input: ContentReportInput,
): Promise<ContentReportDeliveryStatus> => {
  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK_URL ?? '';
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
