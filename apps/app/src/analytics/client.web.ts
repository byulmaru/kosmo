import posthogClient from 'posthog-js';
import { getPublicConfig } from '@/config/public';
import type { PostHog } from 'posthog-js';
import type { AnalyticsEventName, AnalyticsEventProperties } from './events';

const POSTHOG_USER_ID = '$user_id';

let client: PostHog | null | undefined;
let selectedProfileContext: { accountId: string; profileId: string } | null = null;

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
      disable_session_recording: true,
      mask_personal_data_properties: false,
      before_send: (event) => {
        if (
          !event ||
          event.event !== '$pageview' ||
          !selectedProfileContext ||
          !client ||
          getPostHogAccountId(client) !== selectedProfileContext.accountId ||
          client.get_distinct_id() !== selectedProfileContext.accountId
        ) {
          return event;
        }
        return {
          ...event,
          properties: {
            ...event.properties,
            selected_profile_id: selectedProfileContext.profileId,
          },
        };
      },
    });
  } catch {
    client = null;
  }

  return client;
}

export function trackAnalytics<Name extends AnalyticsEventName>(
  eventName: Name,
  properties: AnalyticsEventProperties[Name],
): void {
  try {
    const analyticsClient = initializeAnalytics();
    if (!analyticsClient) {
      return;
    }

    if (eventName === 'profile_selected') {
      const accountId = getPostHogAccountId(analyticsClient);
      const profileId = (properties as AnalyticsEventProperties['profile_selected'])
        .selected_profile_id;
      if (accountId && analyticsClient.get_distinct_id() === accountId) {
        setAnalyticsSelectedProfile(accountId, profileId);
      }
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

export function setAnalyticsSelectedProfile(
  accountId: string | null,
  selectedProfileId: string | null,
): void {
  selectedProfileContext =
    accountId && selectedProfileId ? { accountId, profileId: selectedProfileId } : null;
}

export function identifyAnalytics(accountId: string, availableProfileCount?: number): void {
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

    analyticsClient.identify(
      accountId,
      availableProfileCount === undefined
        ? undefined
        : { available_profile_count: availableProfileCount },
    );
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function clearAnalytics(): void {
  selectedProfileContext = null;
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
