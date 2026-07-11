import { useCallback } from 'react';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import type { PropsWithChildren } from 'react';
import type { GraphQLResponse, RequestParameters } from 'relay-runtime';

type RelayMockValue = {
  mutationError?: string;
  mutationLoading?: boolean;
  mutationResponse?: unknown;
  paginationError?: string | boolean;
  paginationLoading?: boolean;
  paginationResponse?: unknown;
  queryData?: unknown;
};

export function RelayStoryProvider({
  children,
  mutationError,
  mutationLoading,
  mutationResponse,
  paginationError,
  paginationLoading,
  paginationResponse,
  queryData,
}: PropsWithChildren<RelayMockValue>) {
  const createEnvironment = useCallback(
    () =>
      createStoryEnvironment({
        mutationError,
        mutationLoading,
        mutationResponse,
        paginationError,
        paginationLoading,
        paginationResponse,
        queryData,
      }),
    [
      mutationError,
      mutationLoading,
      mutationResponse,
      paginationError,
      paginationLoading,
      paginationResponse,
      queryData,
    ],
  );

  return <RelayActorProvider createEnvironment={createEnvironment}>{children}</RelayActorProvider>;
}

function createStoryEnvironment(mock: RelayMockValue): Environment {
  return new Environment({
    network: Network.create((request) => executeStoryOperation(request, mock)),
    store: new Store(new RecordSource()),
  });
}

function executeStoryOperation(
  request: RequestParameters,
  mock: RelayMockValue,
): Promise<GraphQLResponse> {
  if (request.operationKind === 'mutation') {
    if (mock.mutationError) {
      return Promise.reject(new Error(mock.mutationError));
    }
    if (mock.mutationLoading) {
      return new Promise(() => undefined);
    }

    return Promise.resolve({ data: (mock.mutationResponse ?? {}) as GraphQLResponse['data'] });
  }

  if (request.name.endsWith('NextPageQuery')) {
    if (mock.paginationError) {
      return Promise.reject(
        new Error(
          typeof mock.paginationError === 'string'
            ? mock.paginationError
            : '다음 페이지를 불러오지 못했습니다.',
        ),
      );
    }
    if (mock.paginationLoading) {
      return new Promise(() => undefined);
    }

    return Promise.resolve({ data: (mock.paginationResponse ?? {}) as GraphQLResponse['data'] });
  }

  return Promise.resolve({ data: (mock.queryData ?? {}) as GraphQLResponse['data'] });
}
