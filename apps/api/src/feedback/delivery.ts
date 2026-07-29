import { ConflictError, ValidationError } from '@kosmo/core/error';

export const FEEDBACK_DELIVERY_TIMEOUT_MS = 5_000;

export type FeedbackKind = 'POSITIVE' | 'NEGATIVE' | 'FEATURE_REQUEST' | 'BUG_REPORT';

export type FeedbackInput = {
  body: string;
  kind: FeedbackKind;
};

export type FeedbackIdentity = {
  accountId: string;
  profile: {
    displayName: string;
    id: string;
    relativeHandle: string;
  } | null;
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
      url.origin !== 'https://hooks.slack.com' ||
      url.username ||
      url.password ||
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

const createPayload = (
  { body, kind }: FeedbackInput,
  { accountId, profile }: FeedbackIdentity,
) => ({
  blocks: [
    {
      text: { text: '새 피드백', type: 'plain_text' },
      type: 'header',
    },
    {
      fields: [
        { text: `종류: ${kindLabels[kind]}`, type: 'plain_text' },
        { text: `Account ID: ${accountId}`, type: 'plain_text' },
        ...(profile
          ? [
              { text: `닉네임: ${profile.displayName}`, type: 'plain_text' },
              { text: `Profile ID: ${profile.id}`, type: 'plain_text' },
              { text: `Profile: ${profile.relativeHandle}`, type: 'plain_text' },
            ]
          : [{ text: 'Profile: 선택된 프로필 없음', type: 'plain_text' }]),
      ],
      type: 'section',
    },
    {
      text: { text: body, type: 'plain_text' },
      type: 'section',
    },
  ],
  text: `새 피드백 · 종류: ${kindLabels[kind]}`,
  unfurl_links: false,
  unfurl_media: false,
});

const claimDelivery = (accountId: string) => {
  if (inFlightFeedbackDeliveries.has(accountId)) {
    throw new ConflictError({ message: '피드백을 처리 중이에요. 잠시 후 다시 시도해주세요.' });
  }

  inFlightFeedbackDeliveries.add(accountId);
};

export const deliverFeedback = async (identity: FeedbackIdentity, input: FeedbackInput) => {
  const webhookUrl = getWebhookUrl(process.env.SLACK_FEEDBACK_WEBHOOK_URL);
  if (!webhookUrl) {
    throw new ValidationError('피드백을 전달할 수 없어요. 잠시 후 다시 시도해주세요.');
  }

  claimDelivery(identity.accountId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEEDBACK_DELIVERY_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(webhookUrl, {
      body: JSON.stringify(createPayload(input, identity)),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Slack feedback delivery failed');
    }
  } catch {
    throw new ValidationError('피드백을 전달하지 못했어요. 다시 시도해주세요.');
  } finally {
    clearTimeout(timeout);
    inFlightFeedbackDeliveries.delete(identity.accountId);
  }

  return { completed: true } as const;
};
