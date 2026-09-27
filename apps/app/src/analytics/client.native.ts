import PostHog from 'posthog-react-native';
import { getPublicConfig } from '@/config/public';
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  ReactionAnalyticsEventArgs,
} from './events';

type PostHogClient = InstanceType<typeof PostHog>;

let client: PostHogClient | null | undefined;

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
      captureAppLifecycleEvents: false,
      disableRemoteFeatureFlags: true,
      enableSessionReplay: false,
      sendFeatureFlagEvent: false,
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

export function trackAnalyticsForAccount(
  accountId: string,
  ...[eventName, properties]: ReactionAnalyticsEventArgs
): void {
  if (!accountId) {
    return;
  }

  // Emoji-level analytics is Web-only; preserve Native's existing event properties.
  trackAnalytics(eventName, { reaction_type: properties.reaction_type });
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
