type TrackProperties = Record<string, unknown>;

export function initializeAnalytics(): null {
  return null;
}

export function trackAnalytics(name: string, properties?: TrackProperties): void {
  void name;
  void properties;
}

export function identifyAnalytics(accountId: string): void {
  void accountId;
}

export function clearAnalytics(): void {}
