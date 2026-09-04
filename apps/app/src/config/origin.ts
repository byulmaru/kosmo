import { getPublicConfig } from './public';

const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function getPublicWebOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeOrigin(window.location.origin, 'Web origin');
  }

  return normalizeOrigin(getPublicConfig('webOrigin'), 'Web origin');
}

export function getApiOrigin(): string {
  return normalizeOrigin(getPublicConfig('apiOrigin'), 'API origin');
}

function normalizeOrigin(value: string, environmentName: string): string {
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
    !(origin.protocol === 'http:' && loopbackHosts.has(origin.hostname))
  ) {
    throw new Error(`${environmentName} must use HTTPS outside loopback development origins.`);
  }

  return origin.origin;
}
