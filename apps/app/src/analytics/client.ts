import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  ReactionAnalyticsEventArgs,
} from './events';

export function trackAnalytics<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): void {
  void name;
  void properties;
}

export function trackAnalyticsForAccount(
  accountId: string,
  ...args: ReactionAnalyticsEventArgs
): void {
  void accountId;
  void args;
}

export function identifyAnalytics(accountId: string, availableProfileCount?: number): void {
  void accountId;
  void availableProfileCount;
}

export function setAnalyticsSelectedProfile(
  accountId: string | null,
  selectedProfileId: string | null,
): void {
  void accountId;
  void selectedProfileId;
}

export function clearAnalytics(): void {}
