export async function capturePostHogEvent({
  distinct_id,
  event,
  properties,
  timestamp,
  uuid,
}: {
  readonly distinct_id: string;
  readonly event: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp: string;
  readonly uuid: string;
}): Promise<void> {
  const host = process.env.POSTHOG_HOST?.trim();
  const key = process.env.POSTHOG_KEY?.trim();
  if (!host || !key) {
    throw new Error('POSTHOG_HOST and POSTHOG_KEY are required when ENVIRONMENT=prod.');
  }

  const endpoint = new URL('/capture/', host);
  if (endpoint.protocol !== 'https:') {
    throw new Error('POSTHOG_HOST must use HTTPS.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id,
      timestamp,
      uuid,
      properties,
    }),
  });

  if (!response.ok) {
    throw new Error(`PostHog capture failed with HTTP ${response.status}.`);
  }
}
