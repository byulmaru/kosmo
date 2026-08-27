import posthogClient from 'posthog-js';
import { encodeAnalyticsEvent } from './events';
import type { BeforeSendFn, PostHog, PostHogConfig } from 'posthog-js';
import type { AnalyticsEventArgs } from './events';

const POSTHOG_E2E_HOST = 'https://posthog.e2e.invalid';

const removeRawPathnameFromNonPageviews: BeforeSendFn = (event) => {
  if (!event || event.event === '$pageview' || !event.properties) {
    return event;
  }

  const properties = { ...event.properties };
  delete properties.$pathname;
  return { ...event, properties };
};

const POSTHOG_CONFIG = {
  advanced_disable_flags: true,
  autocapture: false,
  before_send: removeRawPathnameFromNonPageviews,
  capture_exceptions: false,
  capture_pageleave: false,
  capture_pageview: false,
  capture_performance: false,
  disable_capture_url_hashes: true,
  disable_external_dependency_loading: true,
  disable_scroll_properties: true,
  disable_session_recording: true,
  enable_heatmaps: false,
  enable_recording_console_log: false,
  opt_out_useragent_filter: false,
  persistence: 'memory',
  person_profiles: 'identified_only',
  property_denylist: [
    '$current_url',
    '$host',
    '$initial_current_url',
    '$initial_host',
    '$initial_pathname',
    '$initial_referrer',
    '$initial_referring_domain',
    '$prev_pageview_pathname',
    '$raw_user_agent',
    '$referrer',
    '$referring_domain',
    '$search_engine',
    '$session_entry_host',
    '$session_entry_pathname',
    '$session_entry_referrer',
    '$session_entry_referring_domain',
    '$session_entry_url',
    '$session_entry_search_engine',
    '$session_entry_ph_keyword',
    'ph_keyword',
    'title',
    'utm_campaign',
    'utm_content',
    'utm_medium',
    'utm_source',
    'utm_term',
  ],
  save_campaign_params: false,
  save_referrer: false,
} satisfies Partial<PostHogConfig>;

let client: PostHog | null | undefined;
let identifiedAccountId: string | null = null;
let identitySyncPending = false;

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
      opt_out_useragent_filter:
        apiHost === POSTHOG_E2E_HOST && process.env.EXPO_PUBLIC_POSTHOG_E2E_CAPTURE_BOTS === 'true',
    });
  } catch {
    client = null;
  }

  return client;
}

export function getAnalyticsClient(): PostHog | null {
  return initializeAnalytics();
}

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  if (identitySyncPending) {
    return;
  }

  try {
    const event = encodeAnalyticsEvent(...args);
    getAnalyticsClient()?.capture(
      event.name,
      event.properties as Parameters<PostHog['capture']>[1],
    );
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

export function identifyAnalytics(accountId: string): boolean {
  if (!accountId) {
    return true;
  }

  if (identifiedAccountId === accountId) {
    identitySyncPending = false;
    return true;
  }

  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient) {
      identitySyncPending = false;
      return true;
    }

    identitySyncPending = true;
    if (identifiedAccountId !== null && !resetPostHogIdentity(analyticsClient)) {
      return false;
    }

    analyticsClient.identify(accountId);
    identifiedAccountId = accountId;
    identitySyncPending = false;
    return true;
  } catch {
    // Analytics is best-effort and must not affect the product flow.
    identitySyncPending = true;
    return false;
  }
}

export function clearAnalytics(): boolean {
  if (identifiedAccountId === null && !identitySyncPending) {
    return true;
  }

  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient) {
      identitySyncPending = false;
      return true;
    }

    identitySyncPending = true;
    if (resetPostHogIdentity(analyticsClient)) {
      identifiedAccountId = null;
      identitySyncPending = false;
      return true;
    }
    return false;
  } catch {
    // Analytics is best-effort and must not affect the product flow.
    identitySyncPending = true;
    return false;
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
  identifiedAccountId = null;
  identitySyncPending = false;
}
