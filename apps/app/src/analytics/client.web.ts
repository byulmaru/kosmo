import posthogClient from 'posthog-js';
import { getPublicConfig } from '@/config/public';
import type { PostHog } from 'posthog-js';
import type {
  AnalyticsCaptureOptions,
  AnalyticsEventName,
  AnalyticsEventProperties,
} from './events';

const POSTHOG_USER_ID = '$user_id';

let client: PostHog | null | undefined;

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
    });
  } catch {
    client = null;
  }

  return client;
}

export function trackAnalytics<Name extends AnalyticsEventName>(
  eventName: Name,
  properties: AnalyticsEventProperties[Name],
  options?: AnalyticsCaptureOptions,
): void {
  try {
    const analyticsClient = initializeAnalytics();
    if (!analyticsClient) {
      return;
    }

    if (
      options?.accountId !== undefined &&
      (getPostHogAccountId(analyticsClient) !== options.accountId ||
        analyticsClient.get_distinct_id() !== options.accountId)
    ) {
      return;
    }

    const captureOptions =
      options?.uuid !== undefined || options?.timestamp !== undefined
        ? {
            ...(options.uuid !== undefined ? { uuid: options.uuid } : {}),
            ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
          }
        : undefined;

    if (captureOptions) {
      analyticsClient.capture(
        eventName,
        properties as Parameters<PostHog['capture']>[1],
        captureOptions,
      );
      return;
    }

    analyticsClient.capture(eventName, properties as Parameters<PostHog['capture']>[1]);
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
