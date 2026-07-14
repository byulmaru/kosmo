export function normalizeSessionToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type NativeSessionConfiguration = {
  apiOrigin: string;
  clientId: string;
  issuer: string;
};

export function parseStoredSessionToken(
  value: unknown,
  expectedConfiguration: NativeSessionConfiguration,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  let stored: unknown;
  try {
    stored = JSON.parse(value) as unknown;
  } catch {
    return null;
  }

  if (
    !stored ||
    typeof stored !== 'object' ||
    Reflect.get(stored, 'apiOrigin') !== expectedConfiguration.apiOrigin ||
    Reflect.get(stored, 'issuer') !== expectedConfiguration.issuer ||
    Reflect.get(stored, 'clientId') !== expectedConfiguration.clientId
  ) {
    return null;
  }

  return normalizeSessionToken(Reflect.get(stored, 'token'));
}

export function serializeStoredSessionToken(
  configuration: NativeSessionConfiguration,
  token: string,
): string {
  const normalizedToken = normalizeSessionToken(token);

  if (!normalizedToken) {
    throw new Error('Session token must not be blank.');
  }

  return JSON.stringify({ ...configuration, token: normalizedToken });
}
