import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';

const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function getWebOrigin(): string {
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

function isNativeRuntime(): boolean {
  return globalThis.navigator?.product === 'ReactNative';
}

export async function executeGraphQLRequest(
  request: RequestParameters,
  variables: Variables,
  token: string | null,
  fetchImplementation: typeof fetch = fetch,
): Promise<GraphQLResponse> {
  if (!request.text) {
    throw new Error(`Relay operation ${request.name} has no query text.`);
  }

  const native = isNativeRuntime();
  const origin = native ? getApiOrigin() : getWebOrigin();
  const response = await fetchImplementation(`${origin}/graphql`, {
    method: 'POST',
    credentials: native ? 'omit' : 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(native && token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      operationName: request.name,
      query: request.text,
      variables,
    }),
  });
  const body = (await response.json().catch(() => null)) as GraphQLResponse | null;

  if (!response.ok) {
    const message =
      body && 'errors' in body
        ? body.errors
            ?.map((error) => error.message)
            .filter(Boolean)
            .join('\n')
        : undefined;
    throw new Error(message || `GraphQL request failed with HTTP ${response.status}.`);
  }

  if (!body) {
    throw new Error('GraphQL response was not JSON.');
  }

  return body;
}

export function formatGraphQLError(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}
