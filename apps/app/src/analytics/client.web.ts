import posthogClient from 'posthog-js';
import type { PostHog, PostHogConfig } from 'posthog-js';
import type { TrackProperties } from './client';

const POST_VISIBILITIES = new Set(['PUBLIC', 'UNLISTED', 'FOLLOWERS', 'DIRECT']);
const SEARCH_TABS = new Set(['popular', 'latest', 'media', 'people']);
const SEARCH_SOURCES = new Set(['keyboard', 'tab', 'recent']);
const POSTHOG_E2E_HOST = 'https://posthog.e2e.invalid';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isStableRouteTemplate = (value: unknown): value is string => {
  if (value === '/') {
    return true;
  }

  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.includes('?') ||
    value.includes('#')
  ) {
    return false;
  }

  const routeSegment =
    /^(?:[A-Za-z0-9+_-]+|\[[A-Za-z0-9_-]+\]|\[\.\.\.[A-Za-z0-9_-]+\]|\[\[\.\.\.[A-Za-z0-9_-]+\]\])$/u;
  return value
    .slice(1)
    .split('/')
    .every((segment) => routeSegment.test(segment));
};

const EVENT_PROPERTIES = {
  $pageview: { route_template: isStableRouteTemplate },
  profile_created: { selected_profile_id: isNonEmptyString },
  profile_selected: { selected_profile_id: isNonEmptyString },
  post_created: {
    selected_profile_id: isNonEmptyString,
    visibility: (value: unknown) => typeof value === 'string' && POST_VISIBILITIES.has(value),
  },
  follow_succeeded: {
    selected_profile_id: isNonEmptyString,
    result: (value: unknown) => value === 'follow' || value === 'request',
  },
  search_submitted: {
    tab: (value: unknown) => typeof value === 'string' && SEARCH_TABS.has(value),
    source: (value: unknown) => typeof value === 'string' && SEARCH_SOURCES.has(value),
  },
  search_results_loaded: {
    tab: (value: unknown) => typeof value === 'string' && SEARCH_TABS.has(value),
    has_results: (value: unknown) => typeof value === 'boolean',
  },
  search_result_selected: {
    tab: (value: unknown) => typeof value === 'string' && SEARCH_TABS.has(value),
  },
} as const;

type AnalyticsEventName = keyof typeof EVENT_PROPERTIES;

function sanitizeAnalyticsProperties(
  event: string,
  properties?: TrackProperties,
): Record<string, unknown> | null {
  const allowedProperties = EVENT_PROPERTIES[event as AnalyticsEventName];
  if (!allowedProperties) {
    return null;
  }

  const sanitizedProperties: Record<string, unknown> = {};
  for (const [property, isValid] of Object.entries(allowedProperties)) {
    const value = properties?.[property];
    if (isValid(value)) {
      sanitizedProperties[property] = value;
    }
  }

  return Object.keys(sanitizedProperties).length > 0 ? sanitizedProperties : null;
}

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
    '$pathname',
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

export function trackAnalytics(name: string, properties?: TrackProperties): void {
  const sanitizedProperties = sanitizeAnalyticsProperties(name, properties);
  if (!sanitizedProperties) {
    return;
  }

  try {
    getAnalyticsClient()?.capture(
      name as AnalyticsEventName,
      sanitizedProperties as Parameters<PostHog['capture']>[1],
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
    if (analyticsClient && resetPostHogIdentity(analyticsClient)) {
      identifiedAccountId = null;
    }
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
  identifiedAccountId = null;
}
