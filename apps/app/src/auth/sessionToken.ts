export function normalizeSessionToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function parseStoredSessionToken(value: unknown, expectedOrigin: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  let stored: unknown;
  try {
    stored = JSON.parse(value) as unknown;
  }
  catch {
    return null;
  }

  if (!stored || typeof stored !== 'object' || Reflect.get(stored, 'origin') !== expectedOrigin) {
    return null;
  }

  return normalizeSessionToken(Reflect.get(stored, 'token'));
}

export function serializeStoredSessionToken(origin: string, token: string): string {
  const normalizedToken = normalizeSessionToken(token);

  if (!normalizedToken) {
    throw new Error('Session token must not be blank.');
  }

  return JSON.stringify({ origin, token: normalizedToken });
}
