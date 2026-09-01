import posthogClient from 'posthog-js';
import type { BeforeSendFn, PostHog, PostHogConfig, Properties } from 'posthog-js';
import type { AnalyticsEventArgs } from './events';

const POSTHOG_USER_ID = '$user_id';
const MASKED_PERSONAL_DATA_VALUE = '<masked>';
const REFERRER_PERSONAL_QUERY_PARAMETERS = [
  'q',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'igshid',
  'ttclid',
  'rdt_cid',
  'epik',
  'qclid',
  'sccid',
  'irclid',
  '_kx',
] as const;
const REFERRER_DERIVED_SEARCH_PROPERTIES = [
  'ph_keyword',
  '$initial_ph_keyword',
  '$session_entry_ph_keyword',
] as const;
const REFERRER_URL_PROPERTIES = [
  '$referrer',
  '$initial_referrer',
  '$session_entry_referrer',
] as const;
const REFERRER_PROPERTY_GROUPS = ['properties', '$set', '$set_once'] as const;

const maskReferrerPersonalDataBeforeSend: BeforeSendFn = (event) => {
  if (!event) {
    return event;
  }

  let maskedEvent = event;
  for (const group of REFERRER_PROPERTY_GROUPS) {
    const properties = event[group];
    if (!properties) {
      continue;
    }

    const maskedProperties = maskReferrerPersonalData(properties);
    if (maskedProperties !== properties) {
      maskedEvent = { ...maskedEvent, [group]: maskedProperties };
    }
  }

  return maskedEvent;
};

function maskReferrerPersonalData(properties: Properties): Properties {
  let maskedProperties = properties;
  for (const property of REFERRER_URL_PROPERTIES) {
    const value = maskedProperties[property];
    const maskedValue = maskPersonalQueryParameters(value);
    if (maskedValue !== value) {
      maskedProperties = { ...maskedProperties, [property]: maskedValue };
    }
  }

  for (const property of REFERRER_DERIVED_SEARCH_PROPERTIES) {
    const value = maskedProperties[property];
    if (typeof value === 'string' && value && value !== MASKED_PERSONAL_DATA_VALUE) {
      maskedProperties = { ...maskedProperties, [property]: MASKED_PERSONAL_DATA_VALUE };
    }
  }

  return maskedProperties;
}

function maskPersonalQueryParameters(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const url = new URL(value);
    let changed = false;
    for (const parameter of REFERRER_PERSONAL_QUERY_PARAMETERS) {
      if (
        url.searchParams.has(parameter) &&
        url.searchParams.get(parameter) !== MASKED_PERSONAL_DATA_VALUE
      ) {
        url.searchParams.set(parameter, MASKED_PERSONAL_DATA_VALUE);
        changed = true;
      }
    }

    return changed ? url.toString() : value;
  } catch {
    return value;
  }
}

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
      before_send: maskReferrerPersonalDataBeforeSend,
      custom_personal_data_properties: ['q'],
      defaults: '2026-05-30',
      mask_personal_data_properties: true,
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

function getPostHogAccountId(analyticsClient: PostHog): string | null {
  const userId = analyticsClient.get_property(POSTHOG_USER_ID);
  return typeof userId === 'string' && userId ? userId : null;
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
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient || !getPostHogAccountId(analyticsClient)) {
      return;
    }

    analyticsClient.reset();
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
}
