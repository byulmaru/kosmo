import { getGraphQLErrorCode, StructuredClientError } from '@/observability/client-error';
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
  let response: Response;
  try {
    response = await fetchImplementation(`${origin}/graphql`, {
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
  } catch (cause) {
    throw new StructuredClientError({
      cause,
      code: 'NETWORK_REQUEST_FAILED',
      message: cause instanceof Error ? cause.message : 'GraphQL request failed.',
      origin: 'transport',
      type: 'network',
    });
  }
  const body = (await response.json().catch(() => null)) as GraphQLResponse | null;

  if (!response.ok) {
    const responseError = getResponseError(body);
    if (responseError) {
      throw new StructuredClientError({
        code: getGraphQLErrorCode(responseError) ?? 'GRAPHQL_RESPONSE_ERROR',
        message: getResponseErrorMessage(body),
        origin: 'graphql-response',
        type: 'graphql',
      });
    }

    throw new StructuredClientError({
      code: `HTTP_${response.status}`,
      message: `GraphQL request failed with HTTP ${response.status}.`,
      origin: 'transport',
      type: 'network',
    });
  }

  if (!body) {
    throw new StructuredClientError({
      code: 'INVALID_GRAPHQL_RESPONSE',
      message: 'GraphQL response was not JSON.',
      origin: 'transport',
      type: 'network',
    });
  }

  return body;
}

export function formatGraphQLError(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function getResponseError(body: GraphQLResponse | null): unknown {
  if (!body || Array.isArray(body) || !('errors' in body)) {
    return null;
  }

  return body.errors?.[0] ?? null;
}

function getResponseErrorMessage(body: GraphQLResponse | null): string {
  if (!body || Array.isArray(body) || !('errors' in body)) {
    return 'GraphQL request failed.';
  }

  return (
    body.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join('\n') || 'GraphQL request failed.'
  );
}
