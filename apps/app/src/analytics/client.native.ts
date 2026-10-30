import PostHog from 'posthog-react-native';
import { getPublicConfig } from '@/config/public';
import type { AnalyticsEventName, AnalyticsEventProperties } from './events';

type PostHogClient = InstanceType<typeof PostHog>;

let client: PostHogClient | null | undefined;
let sdkReady = false;

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

    const analyticsClient = new PostHog(apiKey, {
      host,
      captureAppLifecycleEvents: false,
      disableRemoteFeatureFlags: true,
      enableSessionReplay: false,
      sendFeatureFlagEvent: false,
    });
    client = analyticsClient;
    sdkReady = false;
    // Persisted opt-out loads asynchronously, so readiness gates platform eligibility.
    try {
      void analyticsClient
        .ready()
        .then(() => {
          sdkReady = true;
        })
        .catch(() => undefined);
    } catch {
      // Keep capture available while readiness remains unknown.
    }
  } catch {
    client = null;
  }

  return client;
}

export function getPostAnalyticsPlatform(): 'native' | undefined {
  try {
    const analyticsClient = client;
    if (!analyticsClient || !sdkReady || analyticsClient.optedOut || analyticsClient.isDisabled) {
      return undefined;
    }

    return 'native';
  } catch {
    return undefined;
  }
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
  try {
    initializeAnalytics()?.reset();
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}
