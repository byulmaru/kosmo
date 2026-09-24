import { ConflictError, ValidationError } from '@kosmo/core/error';
import { parseSlackWebhookUrl, postSlackWebhook } from '@/slack/webhook';
import type { FeedbackKind } from '@kosmo/core/enums';
import type { FeedbackAttachment } from './attachments';

export type FeedbackInput = {
  body: string;
  kind: FeedbackKind;
  attachments?: readonly FeedbackAttachment[];
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
const slackApiOrigin = 'https://slack.com/api';
const slackUploadOrigin = 'https://files.slack.com';
const slackUploadTimeoutMs = 10_000;
const slackAttachmentsTimeoutMs = 30_000;

const kindLabels: Record<FeedbackKind, string> = {
  BUG_REPORT: '버그',
  FEATURE_REQUEST: '필요한 점',
  NEGATIVE: '나빴던 점',
  POSITIVE: '좋았던 점',
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
  if (!input.attachments?.length) {
    if (!parseSlackWebhookUrl(process.env.SLACK_FEEDBACK_WEBHOOK_URL)) {
      throw new ValidationError('피드백을 전달할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  } else if (!process.env.SLACK_FEEDBACK_BOT_TOKEN || !process.env.SLACK_FEEDBACK_CHANNEL_ID) {
    throw new ValidationError('피드백을 전달할 수 없어요. 잠시 후 다시 시도해주세요.');
  }

  claimDelivery(identity.accountId);

  try {
    if (input.attachments?.length) {
      await deliverFeedbackWithAttachments(identity, input, input.attachments);
    } else {
      const webhookUrl = parseSlackWebhookUrl(process.env.SLACK_FEEDBACK_WEBHOOK_URL);
      if (!webhookUrl) {
        throw new ValidationError('피드백을 전달할 수 없어요. 잠시 후 다시 시도해주세요.');
      }
      await postSlackWebhook(webhookUrl, createPayload(input, identity), (response) => {
        if (!response.ok) {
          throw new Error('Slack feedback delivery failed');
        }
      });
    }
  } catch {
    throw new ValidationError('피드백을 전달하지 못했어요. 다시 시도해주세요.');
  } finally {
    inFlightFeedbackDeliveries.delete(identity.accountId);
  }

  return { completed: true } as const;
};

async function deliverFeedbackWithAttachments(
  identity: FeedbackIdentity,
  input: FeedbackInput,
  attachments: readonly FeedbackAttachment[],
): Promise<void> {
  const token = process.env.SLACK_FEEDBACK_BOT_TOKEN;
  const channelId = process.env.SLACK_FEEDBACK_CHANNEL_ID;
  if (!token || !channelId) {
    throw new ValidationError('피드백을 전달할 수 없어요. 잠시 후 다시 시도해주세요.');
  }

  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), slackAttachmentsTimeoutMs);
  try {
    const files: { id: string }[] = [];
    for (const [index, attachment] of attachments.entries()) {
      const upload = await slackApiRequest<{ file_id: string; upload_url: string }>(
        'files.getUploadURLExternal',
        token,
        {
          filename: `feedback-${index + 1}.${fileExtension(attachment.contentType)}`,
          length: attachment.bytes.byteLength,
        },
        deadline.signal,
      );
      if (!upload.file_id || !isSlackUploadUrl(upload.upload_url)) {
        throw new Error('Slack upload URL response was invalid');
      }

      await fetchWithTimeout(
        upload.upload_url,
        {
          body: new Blob([copyBytes(attachment.bytes)], { type: attachment.contentType }),
          headers: { 'content-type': attachment.contentType },
          method: 'POST',
          redirect: 'error',
          signal: deadline.signal,
        },
        slackUploadTimeoutMs,
      ).then(async (response) => {
        if (!response.ok) {
          throw new Error('Slack file upload failed');
        }
        if (response.body && !response.bodyUsed) {
          await response.body.cancel().catch(() => undefined);
        }
      });
      files.push({ id: upload.file_id });
    }

    await slackApiRequest(
      'files.completeUploadExternal',
      token,
      { blocks: createPayload(input, identity).blocks, channel_id: channelId, files },
      deadline.signal,
    );
  } finally {
    clearTimeout(deadlineTimer);
  }
}

async function slackApiRequest<T>(
  method: string,
  token: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const payload = await fetchJsonWithTimeout<T>(
    `${slackApiOrigin}/${method}`,
    {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
      signal,
    },
    slackUploadTimeoutMs,
  );
  return payload;
}

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<T & { ok?: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (init.signal?.aborted) {
    controller.abort();
  } else {
    init.signal?.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const response = await globalThis.fetch(input, { ...init, signal: controller.signal });
    const payload = (await response.json().catch(() => null)) as (T & { ok?: boolean }) | null;
    if (!response.ok || !payload?.ok) {
      throw new Error('Slack API request failed');
    }
    return payload;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', onAbort);
  }
}

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (init.signal?.aborted) {
    controller.abort();
  } else {
    init.signal?.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', onAbort);
  }
};

const isSlackUploadUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.origin === slackUploadOrigin &&
      url.pathname.startsWith('/upload/v1/') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

const fileExtension = (contentType: FeedbackAttachment['contentType']): string =>
  contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';

const copyBytes = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
};
