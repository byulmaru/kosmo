import type { AnalyticsEventName, AnalyticsEventProperties } from './events';

export function trackAnalytics<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): void {
  void name;
  void properties;
}

export function trackAnalyticsForAccount<Name extends AnalyticsEventName>(
  accountId: string,
  name: Name,
  properties: AnalyticsEventProperties[Name],
): void {
  void accountId;
  void name;
  void properties;
}

export function trackAnalyticsScreen(screenName: string): void {
  void screenName;
}

export function setPendingOnboardingHomeView(
  accountId: string | null,
  flowId: string | null,
): void {
  void accountId;
  void flowId;
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
