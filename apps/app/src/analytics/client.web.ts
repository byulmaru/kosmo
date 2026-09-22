import posthogClient from 'posthog-js';
import { getPublicConfig } from '@/config/public';
import type { PostHog, PostHogConfig } from 'posthog-js';
import type { AnalyticsEventArgs, SearchProfileEventArgs } from './events';

const POSTHOG_USER_ID = '$user_id';

let client: PostHog | null | undefined;
let expectedSearchSessionId: string | undefined;

function initializeAnalytics(): PostHog | null {
  const browserHostname = typeof window === 'undefined' ? undefined : window.location.hostname;
  if (
    browserHostname === 'localhost' ||
    browserHostname === '127.0.0.1' ||
    browserHostname === '[::1]'
  ) {
    client = null;
    return client;
  }

  if (client !== undefined) {
    return client;
  }

  const configuredApiKey = getPublicConfig('posthogKey');
  const configuredApiHost = getPublicConfig('posthogHost');

  if (!configuredApiKey || !configuredApiHost) {
    client = null;
    return client;
  }

  try {
    client = posthogClient.init(configuredApiKey, {
      api_host: configuredApiHost,
      defaults: '2026-05-30',
      mask_personal_data_properties: false,
      before_send: (event) => {
        if (
          event &&
          (event.event === 'search_profile_view_succeeded' ||
            event.event === 'search_profile_follow_succeeded') &&
          event.properties.$session_id !== expectedSearchSessionId
        ) {
          return null;
        }
        return event;
      },
    } satisfies Partial<PostHogConfig>);
  } catch {
    client = null;
  }

  return client;
}

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  try {
    initializeAnalytics()?.capture(args[0], args[1] as Parameters<PostHog['capture']>[1]);
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
    const analyticsClient = initializeAnalytics();
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
    const analyticsClient = initializeAnalytics();
    if (!analyticsClient || !getPostHogAccountId(analyticsClient)) {
      return;
    }

    analyticsClient.reset();
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

/** Check the session on the final SDK payload, after its lazy session rotation. */
export function captureSearchProfileAnalytics(
  args: SearchProfileEventArgs,
  expectedSessionId?: string,
  occurredAt = Date.now(),
): string | null {
  try {
    expectedSearchSessionId = expectedSessionId;
    // Share the judgment clock with HogQL, including the exact 30-minute boundary.
    const result = initializeAnalytics()?.capture(args[0], args[1], {
      timestamp: new Date(occurredAt),
    });
    const sessionId: unknown = result?.properties.$session_id;
    return typeof sessionId === 'string' ? sessionId : null;
  } catch {
    return null;
  } finally {
    expectedSearchSessionId = undefined;
  }
}

export function observeAnalyticsSession(onSession: (sessionId: string) => void): () => void {
  try {
    return initializeAnalytics()?.onSessionId(onSession) ?? (() => {});
  } catch {
    return () => {};
  }
}
