import { ConflictError, ValidationError } from '@kosmo/core/error';

export const FEEDBACK_DELIVERY_TIMEOUT_MS = 5_000;

export type FeedbackKind = 'POSITIVE' | 'NEGATIVE' | 'FEATURE_REQUEST' | 'BUG_REPORT';

export type FeedbackInput = {
  body: string;
  kind: FeedbackKind;
  sentryEventId?: string | null;
};

const inFlightFeedbackDeliveries = new Set<string>();
const slackWebhookPath = /^\/services\/[^/]+\/[^/]+\/[^/]+$/u;

const kindLabels: Record<FeedbackKind, string> = {
  BUG_REPORT: '버그',
  FEATURE_REQUEST: '필요한 점',
  NEGATIVE: '나빴던 점',
  POSITIVE: '좋았던 점',
};

const getWebhookUrl = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'hooks.slack.com' ||
      !slackWebhookPath.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
};

const createPayload = ({ body, kind, sentryEventId }: FeedbackInput) => ({
  blocks: [
    {
      text: { text: '새 Web 피드백', type: 'plain_text' },
      type: 'header',
    },
    {
      fields: [
        { text: `종류: ${kindLabels[kind]}`, type: 'plain_text' },
        { text: '출처: Web', type: 'plain_text' },
      ],
      type: 'section',
    },
    {
      text: { text: body, type: 'plain_text' },
      type: 'section',
    },
    ...(sentryEventId
      ? [
          {
            fields: [{ text: `Sentry event ID: ${sentryEventId}`, type: 'plain_text' }],
            type: 'section',
          },
        ]
      : []),
  ],
  text: '새 Web 피드백',
  unfurl_links: false,
  unfurl_media: false,
});

const claimDelivery = (accountId: string) => {
  if (inFlightFeedbackDeliveries.has(accountId)) {
    throw new ConflictError({ message: '피드백을 처리 중이에요. 잠시 후 다시 시도해주세요.' });
  }

  inFlightFeedbackDeliveries.add(accountId);
};

export const deliverFeedback = async (accountId: string, input: FeedbackInput) => {
  const webhookUrl = getWebhookUrl(process.env.SLACK_FEEDBACK_WEBHOOK_URL);
  if (!webhookUrl) {
    throw new ValidationError('피드백을 전달할 수 없어요. 잠시 후 다시 시도해주세요.');
  }

  claimDelivery(accountId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEEDBACK_DELIVERY_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(webhookUrl, {
      body: JSON.stringify(createPayload(input)),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Slack feedback delivery failed');
    }
  } catch {
    throw new ValidationError('피드백을 전달하지 못했어요. 다시 시도해주세요.');
  } finally {
    clearTimeout(timeout);
    inFlightFeedbackDeliveries.delete(accountId);
  }

  return { completed: true } as const;
};
