import { OpenPanel } from '@openpanel/web';
import type { TrackProperties } from '@openpanel/web';

const OPENPANEL_API_URL = 'https://openpanel.byulmaru.co/api';

let client: OpenPanel | null | undefined;
let identifiedAccountId: string | null = null;

type OpenPanelConstructor = new (options: ConstructorParameters<typeof OpenPanel>[0]) => OpenPanel;

export function initializeAnalytics(
  clientId: string | undefined = process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID,
  Client: OpenPanelConstructor = OpenPanel,
): OpenPanel | null {
  if (client !== undefined) {
    return client;
  }

  if (!clientId) {
    client = null;
    return client;
  }

  try {
    client = new Client({
      apiUrl: OPENPANEL_API_URL,
      clientId,
      sessionReplay: {
        enabled: true,
        maskAllInputs: true,
        maskAllText: false,
        sampleRate: 0.1,
      },
      trackAttributes: true,
      trackOutgoingLinks: true,
      trackScreenViews: true,
    });
  } catch {
    client = null;
  }

  return client;
}

export function getAnalyticsClient(): OpenPanel | null {
  return initializeAnalytics();
}

function ignoreAnalyticsFailure(result: unknown): void {
  if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
    void Promise.resolve(result).catch(() => undefined);
  }
}

export function trackAnalytics(name: string, properties?: TrackProperties): void {
  try {
    ignoreAnalyticsFailure(getAnalyticsClient()?.track(name, properties));
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function identifyAnalytics(accountId: string): void {
  if (identifiedAccountId === accountId) {
    return;
  }

  try {
    const analyticsClient = getAnalyticsClient();
    if (!analyticsClient) {
      return;
    }

    ignoreAnalyticsFailure(analyticsClient.identify({ profileId: accountId }));
    identifiedAccountId = accountId;
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  }
}

export function clearAnalytics(): void {
  try {
    getAnalyticsClient()?.clear();
  } catch {
    // Analytics is best-effort and must not affect the product flow.
  } finally {
    identifiedAccountId = null;
  }
}

export function resetAnalyticsForTests(): void {
  client = undefined;
  identifiedAccountId = null;
}
