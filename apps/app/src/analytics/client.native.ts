import PostHog from 'posthog-react-native';
import { getPublicConfig } from '@/config/public';
import type { AnalyticsEventName, AnalyticsEventProperties } from './events';

type PostHogClient = InstanceType<typeof PostHog>;

let client: PostHogClient | null | undefined;
let pendingOnboardingHomeView: { accountId: string; flowId: string } | null = null;

function initializeAnalytics(): PostHogClient | null {
  if (client !== undefined) {
    return client;
  }

  try {
    const apiKey = getPublicConfig('posthogKey');
    const host = getPublicConfig('posthogHost');
    if (!apiKey || !host) {
      client = null;
      return client;
    }

    client = new PostHog(apiKey, {
      host,
      disableRemoteFeatureFlags: true,
      enableSessionReplay: false,
      sendFeatureFlagEvent: false,
      before_send: (event) => {
        if (event?.event === 'Application Opened' && event.properties) {
          delete event.properties.url;
        }
        return event;
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
    initializeAnalytics()?.capture(
      eventName,
      properties as Parameters<PostHogClient['capture']>[1],
    );
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function trackAnalyticsForAccount<Name extends AnalyticsEventName>(
  accountId: string,
  eventName: Name,
  properties: AnalyticsEventProperties[Name],
): void {
  if (!accountId) {
    return;
  }

  try {
    const analyticsClient = initializeAnalytics();
    if (!analyticsClient || analyticsClient.getDistinctId() !== accountId) {
      return;
    }

    analyticsClient.capture(eventName, properties as Parameters<PostHogClient['capture']>[1]);
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function trackAnalyticsScreen(screenName: string): void {
  if (screenName === '/home' && pendingOnboardingHomeView) {
    const pending = pendingOnboardingHomeView;
    pendingOnboardingHomeView = null;
    trackAnalyticsForAccount(pending.accountId, 'first_profile_onboarding_home_viewed', {
      flow_id: pending.flowId,
    });
  }

  try {
    const analyticsClient = initializeAnalytics();
    if (!analyticsClient) {
      return;
    }

    void analyticsClient.screen(screenName).catch(() => undefined);
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function setPendingOnboardingHomeView(
  accountId: string | null,
  flowId: string | null,
): void {
  pendingOnboardingHomeView = accountId && flowId ? { accountId, flowId } : null;
}

export function identifyAnalytics(accountId: string, availableProfileCount?: number): void {
  if (!accountId) {
    return;
  }

  try {
    initializeAnalytics()?.identify(
      accountId,
      availableProfileCount === undefined
        ? undefined
        : { available_profile_count: availableProfileCount },
    );
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function setAnalyticsSelectedProfile(
  accountId: string | null,
  selectedProfileId: string | null,
): void {
  void accountId;
  void selectedProfileId;
}

export function clearAnalytics(): void {
  pendingOnboardingHomeView = null;
  try {
    initializeAnalytics()?.reset();
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}
