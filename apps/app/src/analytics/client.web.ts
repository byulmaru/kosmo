import posthogClient from 'posthog-js';
import type { PostHog, PostHogConfig } from 'posthog-js';
import type { AnalyticsEventArgs } from './events';

const POSTHOG_USER_STATE = '$user_state';
const POSTHOG_IDENTIFIED_STATE = 'identified';

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

function resetPostHogIdentity(analyticsClient: PostHog): boolean {
  try {
    analyticsClient.reset();
    return true;
  } catch {
    return false;
  }
}

function hasIdentifiedPostHogIdentity(analyticsClient: PostHog): boolean {
  return analyticsClient.get_property(POSTHOG_USER_STATE) === POSTHOG_IDENTIFIED_STATE;
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

    if (
      hasIdentifiedPostHogIdentity(analyticsClient) &&
      analyticsClient.get_distinct_id() !== accountId
    ) {
      if (!resetPostHogIdentity(analyticsClient)) {
        return;
      }
    }

    analyticsClient.identify(accountId);
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function clearAnalytics(): void {
  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient || !hasIdentifiedPostHogIdentity(analyticsClient)) {
      return;
    }

    resetPostHogIdentity(analyticsClient);
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
}
