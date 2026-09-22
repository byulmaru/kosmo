import type {
  AnalyticsCaptureOptions,
  AnalyticsEventName,
  AnalyticsEventProperties,
} from './events';

export function trackAnalytics<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
  options?: AnalyticsCaptureOptions,
): void {
  void name;
  void properties;
  void options;
}

export function identifyAnalytics(accountId: string): void {
  void accountId;
}

export function clearAnalytics(): void {}
