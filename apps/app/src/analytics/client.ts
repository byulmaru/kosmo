import type { AnalyticsEventArgs } from './events';

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  void args;
}

export function identifyAnalytics(accountId: string): void {
  void accountId;
}

export function clearAnalytics(): void {}
