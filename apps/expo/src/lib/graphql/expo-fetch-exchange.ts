import { sessionName } from '@kosmo/core';
import { ExchangeError, GraphQLError } from '@mearie/core';
import { filter, fromPromise, merge, mergeMap, pipe, tap } from '@mearie/core/stream';
import { fetch } from 'expo/fetch';
import { getItemAsync } from 'expo-secure-store';
import { Platform } from 'react-native';
import { graphqlUrl } from './hostname';
import type {
  Artifact,
  ArtifactKind,
  Exchange,
  OperationMetadataMap,
  OperationResult,
  VariablesOf,
} from '@mearie/core';

declare module '@mearie/core' {
  interface ExchangeErrorExtensionsMap {
    http?: {
      statusCode?: number;
    };
  }
}

type RequestOperation<K extends ArtifactKind = ArtifactKind> = {
  key: string;
  metadata: OperationMetadataMap & Record<string, unknown>;
  variant: 'request';
  artifact: Artifact<K>;
  variables: VariablesOf<Artifact<K>>;
};

type GraphQLResponse = {
  data?: unknown;
  errors?: readonly {
    message: string;
    path?: readonly (string | number)[];
    locations?: readonly { line: number; column: number }[];
    extensions?: Record<string, unknown>;
  }[];
  extensions?: Record<string, unknown>;
};

type ExecuteFetchOptions = {
  operation: RequestOperation;
  signal: AbortSignal;
};

const executeFetch = async ({
  operation,
  signal,
}: ExecuteFetchOptions): Promise<OperationResult | null> => {
  const { artifact, variables } = operation;

  let response;
  try {
    await Promise.resolve();

    const token =
      Platform.OS === 'android' || Platform.OS === 'ios' ? await getItemAsync(sessionName) : null;

    response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        operationName: artifact.name,
        query: artifact.body,
        variables,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    return {
      operation,
      errors: [
        new ExchangeError(error instanceof Error ? error.message : 'Network error', {
          exchangeName: 'http',
          cause: error,
        }),
      ],
    };
  }

  if (!response.ok) {
    return {
      operation,
      errors: [
        new ExchangeError(`HTTP ${response.status}: ${response.statusText}`, {
          exchangeName: 'http',
          extensions: { statusCode: response.status },
        }),
      ],
    };
  }

  let json;
  try {
    json = (await response.json()) as GraphQLResponse;
  } catch (error) {
    return {
      operation,
      errors: [
        new ExchangeError(error instanceof Error ? error.message : 'JSON parse error', {
          exchangeName: 'http',
          cause: error,
        }),
      ],
    };
  }

  return {
    operation,
    data: json.data,
    errors: json.errors?.map(
      (err) =>
        new GraphQLError(err.message, {
          path: err.path,
          locations: err.locations,
          extensions: err.extensions,
        }),
    ),
    extensions: json.extensions,
  };
};

export const expoFetchExchange = (): Exchange => {
  return ({ forward }) => ({
    name: 'http',
    io: (ops$) => {
      const inflight = new Map<string, AbortController>();

      const fetch$ = pipe(
        ops$,
        filter(
          (op): op is RequestOperation =>
            op.variant === 'request' &&
            (op.artifact.kind === 'query' || op.artifact.kind === 'mutation'),
        ),
        mergeMap((op) => {
          inflight.get(op.key)?.abort();

          const controller = new AbortController();
          inflight.set(op.key, controller);

          return fromPromise(
            executeFetch({
              operation: op,
              signal: controller.signal,
            }).then((result) => {
              inflight.delete(op.key);
              return result;
            }),
          );
        }),
        filter((result) => result !== null),
      );

      const forward$ = pipe(
        ops$,
        filter(
          (op) =>
            op.variant === 'teardown' ||
            (op.variant === 'request' &&
              (op.artifact.kind === 'subscription' || op.artifact.kind === 'fragment')),
        ),
        tap((op) => {
          if (op.variant === 'teardown') {
            inflight.get(op.key)?.abort();
            inflight.delete(op.key);
          }
        }),
        forward,
      );

      return merge(fetch$, forward$);
    },
  });
};
