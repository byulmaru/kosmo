export type BrowserRuntimeConfig = Readonly<{
  environment: string;
  sentryDsn: string | null;
  openPanelClientId: string | null;
}>;

export function parseBrowserRuntimeConfig(value: unknown): BrowserRuntimeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid runtime config');
  }

  const config = value as Record<string, unknown>;
  if (
    Object.keys(config).sort().join(',') !== 'environment,openPanelClientId,sentryDsn' ||
    typeof config.environment !== 'string' ||
    !config.environment ||
    (config.sentryDsn !== null && typeof config.sentryDsn !== 'string') ||
    (config.openPanelClientId !== null && typeof config.openPanelClientId !== 'string')
  ) {
    throw new Error('Invalid runtime config');
  }

  return config as BrowserRuntimeConfig;
}

export async function loadRuntimeConfig(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): Promise<BrowserRuntimeConfig> {
  const response = await fetchImplementation('/runtime-config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Runtime config request failed: ${response.status}`);
  }
  return parseBrowserRuntimeConfig(await response.json());
}
