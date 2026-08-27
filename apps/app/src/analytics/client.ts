import type { AnalyticsEventArgs } from './events';

export function initializeAnalytics(): null {
  return null;
}

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  void args;
}

export function identifyAnalytics(accountId: string): boolean {
  void accountId;
  return true;
}

export function clearAnalytics(): boolean {
  return true;
}
