import type { TrackProperties } from './client';

const EVENT_PROPERTIES = {
  $pageview: ['route_template'],
  profile_created: ['selected_profile_id'],
  profile_selected: ['selected_profile_id'],
  post_created: ['selected_profile_id', 'visibility'],
  follow_succeeded: ['selected_profile_id', 'result'],
  search_submitted: ['tab', 'source'],
  search_results_loaded: ['tab', 'has_results'],
  search_result_selected: ['tab'],
} as const;

export type AnalyticsEventName = keyof typeof EVENT_PROPERTIES;

type SanitizedEvent = {
  event: AnalyticsEventName;
  properties: Record<string, unknown>;
};

export function sanitizeAnalyticsEvent(
  event: string,
  properties?: TrackProperties,
): SanitizedEvent | null {
  const allowedProperties = EVENT_PROPERTIES[event as AnalyticsEventName];
  if (!allowedProperties) {
    return null;
  }

  const sanitizedProperties: Record<string, unknown> = {};
  for (const property of allowedProperties) {
    const value = properties?.[property];
    if (value !== undefined) {
      sanitizedProperties[property] = value;
    }
  }

  return {
    event: event as AnalyticsEventName,
    properties: sanitizedProperties,
  };
}
