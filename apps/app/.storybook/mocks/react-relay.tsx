import { useCallback, useMemo, useRef } from 'react';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import type { PropsWithChildren } from 'react';
import type { GraphQLResponse, RequestParameters } from 'relay-runtime';

type RelayMockValue = {
  mutationError?: string;
  mutationGraphQLErrors?: string[];
  mutationLoading?: boolean;
  mutationResponse?: unknown;
  paginationError?: string | boolean;
  paginationLoading?: boolean;
  paginationResponse?: unknown;
  operationResponses?: Record<string, StoryOperationResponse | StoryOperationResponse[]>;
  queryData?: unknown;
};

type StoryOperationResponse = {
  data?: unknown;
  error?: string;
};

export function RelayStoryProvider({
  children,
  mutationError,
  mutationGraphQLErrors,
  mutationLoading,
  mutationResponse,
  paginationError,
  paginationLoading,
  paginationResponse,
  operationResponses,
  queryData,
}: PropsWithChildren<RelayMockValue>) {
  const mock = useMemo<RelayMockValue>(
    () => ({
      mutationError,
      mutationGraphQLErrors,
      mutationLoading,
      mutationResponse,
      paginationError,
      paginationLoading,
      paginationResponse,
      operationResponses,
      queryData,
    }),
    [
      mutationError,
      mutationGraphQLErrors,
      mutationLoading,
      mutationResponse,
      paginationError,
      paginationLoading,
      paginationResponse,
      operationResponses,
      queryData,
    ],
  );
  const environmentState = useRef({ index: 0, mock });
  const createEnvironment = useCallback(() => {
    if (environmentState.current.mock !== mock) {
      environmentState.current = { index: 0, mock };
    }
    const index = environmentState.current.index++;

    return createStoryEnvironment(mock, index);
  }, [mock]);

  return <RelayActorProvider createEnvironment={createEnvironment}>{children}</RelayActorProvider>;
}

function createStoryEnvironment(mock: RelayMockValue, environmentIndex: number): Environment {
  return new Environment({
    network: Network.create((request) => executeStoryOperation(request, mock, environmentIndex)),
    store: new Store(new RecordSource()),
  });
}

function executeStoryOperation(
  request: RequestParameters,
  mock: RelayMockValue,
  environmentIndex: number,
): Promise<GraphQLResponse> {
  if (request.operationKind === 'mutation') {
    if (mock.mutationError) {
      return Promise.reject(new Error(mock.mutationError));
    }
    if (mock.mutationLoading) {
      return new Promise(() => undefined);
    }

    return Promise.resolve({
      data: (mock.mutationResponse ?? {}) as GraphQLResponse['data'],
      errors: mock.mutationGraphQLErrors?.map((message) => ({ message })),
    });
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

  const configuredResponse = mock.operationResponses?.[request.name];
  const operationResponse = Array.isArray(configuredResponse)
    ? configuredResponse[Math.min(environmentIndex, configuredResponse.length - 1)]
    : configuredResponse;

  if (operationResponse?.error) {
    return Promise.reject(new Error(operationResponse.error));
  }

  if (operationResponse) {
    return Promise.resolve({ data: (operationResponse.data ?? {}) as GraphQLResponse['data'] });
  }

  return Promise.resolve({ data: (mock.queryData ?? {}) as GraphQLResponse['data'] });
}
