import posthogClient from 'posthog-js';
import { sanitizeAnalyticsEvent } from './events';
import type { PostHog, PostHogConfig } from 'posthog-js';
import type { TrackProperties } from './client';

const POSTHOG_CONFIG = {
  advanced_disable_flags: true,
  advanced_disable_decide: true,
  advanced_disable_feature_flags: true,
  autocapture: false,
  capture_exceptions: false,
  capture_pageleave: false,
  capture_pageview: false,
  capture_performance: false,
  disable_capture_url_hashes: true,
  disable_compression: true,
  disable_external_dependency_loading: true,
  disable_scroll_properties: true,
  disable_session_recording: true,
  enable_heatmaps: false,
  enable_recording_console_log: false,
  person_profiles: 'identified_only',
  property_denylist: [
    '$current_url',
    '$host',
    '$initial_current_url',
    '$initial_host',
    '$initial_pathname',
    '$initial_referrer',
    '$initial_referring_domain',
    '$pathname',
    '$prev_pageview_pathname',
    '$raw_user_agent',
    '$referrer',
    '$referring_domain',
    '$search_engine',
    'ph_keyword',
    'title',
    'utm_campaign',
    'utm_content',
    'utm_medium',
    'utm_source',
    'utm_term',
  ],
  request_batching: false,
  save_campaign_params: false,
  save_referrer: false,
} satisfies Partial<PostHogConfig>;

let client: PostHog | null | undefined;
let identifiedAccountId: string | null = null;

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
      ...POSTHOG_CONFIG,
    });
  } catch {
    client = null;
  }

  return client;
}

export function getAnalyticsClient(): PostHog | null {
  return initializeAnalytics();
}

function ignoreAnalyticsFailure(result: unknown): void {
  if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
    void Promise.resolve(result).catch(() => undefined);
  }
}

export function trackAnalytics(name: string, properties?: TrackProperties): void {
  const event = sanitizeAnalyticsEvent(name, properties);
  if (!event) {
    return;
  }

  try {
    ignoreAnalyticsFailure(
      getAnalyticsClient()?.capture(
        event.event,
        event.properties as Parameters<PostHog['capture']>[1],
      ),
    );
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function capturePageview(routeTemplate: string): void {
  trackAnalytics('$pageview', { route_template: routeTemplate });
}

function resetPostHogIdentity(analyticsClient: PostHog): boolean {
  try {
    ignoreAnalyticsFailure(analyticsClient.reset());
    return true;
  } catch {
    return false;
  }
}

export function identifyAnalytics(accountId: string): void {
  if (!accountId || identifiedAccountId === accountId) {
    return;
  }

  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient) {
      return;
    }

    if (identifiedAccountId !== null && !resetPostHogIdentity(analyticsClient)) {
      return;
    }

    analyticsClient.identify(accountId);
    identifiedAccountId = accountId;
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function clearAnalytics(): void {
  if (identifiedAccountId === null) {
    return;
  }

  try {
    const analyticsClient = getAnalyticsClient();
    if (analyticsClient) {
      resetPostHogIdentity(analyticsClient);
    }
  } finally {
    identifiedAccountId = null;
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
  identifiedAccountId = null;
}
