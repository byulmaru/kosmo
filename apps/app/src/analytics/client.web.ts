import posthogClient from 'posthog-js';
import type { PostHog, PostHogConfig } from 'posthog-js';
import type { AnalyticsEventArgs } from './events';

const POSTHOG_USER_ID = '$user_id';

let client: PostHog | null | undefined;

export function initializeAnalytics(
  apiKey: string | undefined = process.env.EXPO_PUBLIC_POSTHOG_KEY,
  apiHost: string | undefined = process.env.EXPO_PUBLIC_POSTHOG_HOST,
): PostHog | null {
  if (client !== undefined) {
    return client;
  }

  if (!apiKey || !apiHost) {
    client = null;
    return client;
  }

  try {
    client = posthogClient.init(apiKey, {
      api_host: apiHost,
      defaults: '2026-05-30',
      mask_personal_data_properties: false,
    } satisfies Partial<PostHogConfig>);
  } catch {
    client = null;
  }

  return client;
}

export function getAnalyticsClient(): PostHog | null {
  return initializeAnalytics();
}

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  try {
    getAnalyticsClient()?.capture(args[0], args[1] as Parameters<PostHog['capture']>[1]);
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

function getPostHogAccountId(analyticsClient: PostHog): string | null {
  const userId = analyticsClient.get_property(POSTHOG_USER_ID);
  return typeof userId === 'string' && userId ? userId : null;
}

export function identifyAnalytics(accountId: string): void {
  if (!accountId) {
    return;
  }

  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient) {
      return;
    }

    const currentAccountId = getPostHogAccountId(analyticsClient);
    if (
      currentAccountId &&
      (currentAccountId !== accountId || analyticsClient.get_distinct_id() !== accountId)
    ) {
      analyticsClient.reset();
    }

    analyticsClient.identify(accountId);
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function clearAnalytics(): void {
  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient || !getPostHogAccountId(analyticsClient)) {
      return;
    }

    analyticsClient.reset();
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
}
