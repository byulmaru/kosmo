import { ContentReportDeliveryStatus } from '@kosmo/core/enums';
import { parseSlackWebhookUrl, postSlackWebhook } from '@/slack/webhook';
import type { ContentReportInput } from './target';

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
  const webhookUrl = parseSlackWebhookUrl(process.env.SLACK_FEEDBACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return ContentReportDeliveryStatus.REJECTED;
  }

  try {
    return await postSlackWebhook(webhookUrl, createPayload(input), async (response) => {
      if (response.status !== 200) {
        return ContentReportDeliveryStatus.REJECTED;
      }

      return (await response.text()).trim() === 'ok'
        ? ContentReportDeliveryStatus.DELIVERED
        : ContentReportDeliveryStatus.REJECTED;
    });
  } catch {
    return ContentReportDeliveryStatus.UNKNOWN;
  }
};
