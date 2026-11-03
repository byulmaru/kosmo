import { createClient } from 'graphql-sse';
import { Observable } from 'relay-runtime';
import { getApiOrigin, getPublicWebOrigin } from '@/config/origin';
import { RelayTransportError } from './transportError';
import type {
  GraphQLResponse,
  RequestParameters,
  SubscribeFunction,
  Variables,
} from 'relay-runtime';

export class GraphQLHttpError extends Error {
  readonly operationName: string;
  readonly status: number;
  readonly elapsedMs: number;

  constructor(
    message: string,
    metadata: { operationName: string; status: number; elapsedMs: number },
  ) {
    super(message);
    this.operationName = metadata.operationName;
    this.status = metadata.status;
    this.elapsedMs = metadata.elapsedMs;
  }
}

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
  const startedAt = Date.now();
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
    throw new GraphQLHttpError(message || `GraphQL request failed with HTTP ${response.status}.`, {
      operationName: request.name,
      status: response.status,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    });
  }

  if (!body) {
    throw new Error('GraphQL response was not JSON.');
  }

  return body;
}

export function createGraphQLSubscription(
  token: string | null,
  selectedProfileId: string | null = null,
): SubscribeFunction {
  let client: ReturnType<typeof createClient> | undefined;

  return (request, variables) =>
    Observable.create<GraphQLResponse>((sink) => {
      if (!request.text) {
        sink.error(new Error(`Relay operation ${request.name} has no query text.`));
        return;
      }

      if (!client) {
        const native = isNativeRuntime();
        const origin = native ? getApiOrigin() : getPublicWebOrigin();
        client = createClient({
          url: `${origin}/graphql`,
          credentials: native ? 'omit' : 'include',
          headers: native && token ? { authorization: `Bearer ${token}` } : {},
        });
      }

      return client.subscribe(
        {
          operationName: request.name,
          query: request.text,
          variables,
          ...(selectedProfileId ? { extensions: { selectedProfileId } } : {}),
        },
        {
          next: (response) => sink.next(response as GraphQLResponse),
          error: (cause) => sink.error(new RelayTransportError(cause)),
          complete: () => sink.complete(),
        },
      );
    });
}

export function formatGraphQLError(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}
