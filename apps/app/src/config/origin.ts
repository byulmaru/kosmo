const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function getPublicWebOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeWebOrigin(window.location.origin, false);
  }

  const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN;

  if (configured) {
    return normalizeWebOrigin(configured, process.env.EXPO_PUBLIC_ALLOW_INSECURE_ORIGIN === '1');
  }

  throw new Error('EXPO_PUBLIC_WEB_ORIGIN is required outside the browser.');
}

export function normalizeWebOrigin(value: string, allowInsecure: boolean): string {
  return normalizeOrigin(value, allowInsecure, 'EXPO_PUBLIC_WEB_ORIGIN');
}

export function getApiOrigin(): string {
  const configured = process.env.EXPO_PUBLIC_API_ORIGIN;

  if (!configured) {
    throw new Error('EXPO_PUBLIC_API_ORIGIN is required on native.');
  }

  return normalizeApiOrigin(configured, process.env.EXPO_PUBLIC_ALLOW_INSECURE_ORIGIN === '1');
}

export function normalizeApiOrigin(value: string, allowInsecure: boolean): string {
  return normalizeOrigin(value, allowInsecure, 'EXPO_PUBLIC_API_ORIGIN');
}

function normalizeOrigin(value: string, allowInsecure: boolean, environmentName: string): string {
  let origin: URL;

  try {
    origin = new URL(value);
  } catch {
    throw new Error(`${environmentName} must be a valid URL origin.`);
  }

  if (
    origin.origin === 'null' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(`${environmentName} must not include credentials, a path, query, or hash.`);
  }

  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && (loopbackHosts.has(origin.hostname) || allowInsecure))
  ) {
    throw new Error(`${environmentName} must use HTTPS outside loopback development origins.`);
  }

  return origin.origin;
}
