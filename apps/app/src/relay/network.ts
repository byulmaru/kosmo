import { getApiOrigin, getPublicWebOrigin } from '@/config/origin';
import { RelayTransportError } from './transportError';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';

function isNativeRuntime(): boolean {
  return globalThis.navigator?.product === 'ReactNative';
}

export async function executeGraphQLRequest(
  request: RequestParameters,
  variables: Variables,
  token: string | null,
  fetchImplementation: typeof fetch = fetch,
  selectedProfileId: string | null = null,
): Promise<GraphQLResponse> {
  if (!request.text) {
    throw new Error(`Relay operation ${request.name} has no query text.`);
  }

  const native = isNativeRuntime();
  const origin = native ? getApiOrigin() : getPublicWebOrigin();
  const responsePromise = fetchImplementation(`${origin}/graphql`, {
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
      ...(selectedProfileId ? { extensions: { selectedProfileId } } : {}),
    }),
  });
  const response = await responsePromise.catch((cause) => {
    throw new RelayTransportError(cause);
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
