import type { AnalyticsEventArgs, ReactionAnalyticsEventArgs } from './events';

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  void args;
}

export function trackAnalyticsForAccount(
  accountId: string,
  ...args: ReactionAnalyticsEventArgs
): void {
  void accountId;
  void args;
}

export function identifyAnalytics(accountId: string): void {
  void accountId;
}

export function clearAnalytics(): void {}
