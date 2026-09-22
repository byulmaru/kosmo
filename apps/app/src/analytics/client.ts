import type { AnalyticsEventArgs, SearchProfileEventArgs } from './events';

export function trackAnalytics(...args: AnalyticsEventArgs): void {
  void args;
}

export function identifyAnalytics(accountId: string): void {
  void accountId;
}

export function clearAnalytics(): void {}

export function captureSearchProfileAnalytics(
  args: SearchProfileEventArgs,
  expectedSessionId?: string,
  occurredAt?: number,
): string | null {
  void args;
  void expectedSessionId;
  void occurredAt;
  return null;
}

export function observeAnalyticsSession(onSession: (sessionId: string) => void): () => void {
  void onSession;
  return () => {};
}
