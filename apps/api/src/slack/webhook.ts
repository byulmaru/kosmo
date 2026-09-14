export const SLACK_WEBHOOK_TIMEOUT_MS = 5_000;

const slackWebhookPath = /^\/services\/[^/]+\/[^/]+\/[^/]+$/u;

export const parseSlackWebhookUrl = (value: string | undefined) => {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    return null;
  }

  return url.protocol === 'https:' &&
    url.origin === 'https://hooks.slack.com' &&
    !url.username &&
    !url.password &&
    slackWebhookPath.test(url.pathname) &&
    !url.search &&
    !url.hash
    ? url
    : null;
};

export const postSlackWebhook = async <T>(
  webhookUrl: URL,
  payload: unknown,
  consumeResponse: (response: Response) => Promise<T> | T,
) => {
  const safeWebhookUrl = parseSlackWebhookUrl(webhookUrl.href);
  if (!safeWebhookUrl) {
    throw new TypeError('Invalid Slack webhook URL');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_WEBHOOK_TIMEOUT_MS);
  let response: Response | undefined;

  try {
    response = await globalThis.fetch(safeWebhookUrl, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    });
    return await consumeResponse(response);
  } finally {
    clearTimeout(timeout);
    if (response?.body && !response.bodyUsed) {
      controller.abort();
      try {
        void response.body.cancel().catch(() => undefined);
      } catch {
        // Delivery classification belongs to the caller, not response cleanup.
      }
    }
  }
};
