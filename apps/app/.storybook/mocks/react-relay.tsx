import { useCallback, useMemo, useRef } from 'react';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { RelayActorBoundary, RelayActorProvider } from '@/relay/RelayActorProvider';
import type { PropsWithChildren } from 'react';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';

type RelayMockValue = {
  actorBoundary?: boolean;
  mutationError?: string;
  mutationGraphQLErrors?: Array<string | StoryGraphQLError>;
  mutationLoading?: boolean;
  mutationRequestObserver?: (request: RequestParameters, variables: Variables) => void;
  mutationResponse?: unknown;
  paginationError?: string | boolean;
  paginationLoading?: boolean;
  paginationRequestObserver?: (request: RequestParameters, variables: Variables) => void;
  paginationResponse?: unknown;
  paginationResponses?: StoryOperationResponse[];
  operationResponses?: Record<
    string,
    StoryOperationResponse | StoryOperationResponse[] | StoryOperationResponseSequence
  >;
  queryData?: unknown;
};

type StoryGraphQLError = {
  extensions?: Record<string, unknown>;
  message: string;
};

type StoryOperationResponse = {
  data?: unknown;
  delayMs?: number;
  error?: string;
};

type StoryOperationResponseSequence = {
  sequence: [StoryOperationResponse, ...StoryOperationResponse[]];
};

export function RelayStoryProvider({
  actorBoundary = false,
  children,
  mutationError,
  mutationGraphQLErrors,
  mutationLoading,
  mutationRequestObserver,
  mutationResponse,
  paginationError,
  paginationLoading,
  paginationRequestObserver,
  paginationResponse,
  paginationResponses,
  operationResponses,
  queryData,
}: PropsWithChildren<RelayMockValue>) {
  const mock = useMemo<RelayMockValue>(
    () => ({
      mutationError,
      mutationGraphQLErrors,
      mutationLoading,
      mutationRequestObserver,
      mutationResponse,
      paginationError,
      paginationLoading,
      paginationRequestObserver,
      paginationResponse,
      paginationResponses,
      operationResponses,
      queryData,
    }),
    [
      mutationError,
      mutationGraphQLErrors,
      mutationLoading,
      mutationRequestObserver,
      mutationResponse,
      paginationError,
      paginationLoading,
      paginationRequestObserver,
      paginationResponse,
      paginationResponses,
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

  return (
    <RelayActorProvider createEnvironment={createEnvironment}>
      {actorBoundary ? <RelayActorBoundary>{children}</RelayActorBoundary> : children}
    </RelayActorProvider>
  );
}

function createStoryEnvironment(mock: RelayMockValue, environmentIndex: number): Environment {
  let paginationResponseIndex = 0;
  const operationResponseIndices = new Map<string, number>();
  const nextOperationResponseIndex = (operationName: string) => {
    const index = operationResponseIndices.get(operationName) ?? 0;
    operationResponseIndices.set(operationName, index + 1);
    return index;
  };

  return new Environment({
    network: Network.create((request, variables) =>
      executeStoryOperation(
        request,
        variables,
        mock,
        environmentIndex,
        () => paginationResponseIndex++,
        nextOperationResponseIndex,
      ),
    ),
    store: new Store(new RecordSource()),
  });
}

async function executeStoryOperation(
  request: RequestParameters,
  variables: Variables,
  mock: RelayMockValue,
  environmentIndex: number,
  nextPaginationResponseIndex: () => number,
  nextOperationResponseIndex: (operationName: string) => number,
): Promise<GraphQLResponse> {
  const getOperationResponse = () => {
    const configuredResponse = mock.operationResponses?.[request.name];
    return Array.isArray(configuredResponse)
      ? configuredResponse[Math.min(environmentIndex, configuredResponse.length - 1)]
      : configuredResponse && 'sequence' in configuredResponse
        ? configuredResponse.sequence[
            Math.min(
              nextOperationResponseIndex(request.name),
              configuredResponse.sequence.length - 1,
            )
          ]
        : configuredResponse;
  };
  const resolveOperationResponse = async (
    operationResponse: StoryOperationResponse,
  ): Promise<GraphQLResponse> => {
    if (operationResponse.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, operationResponse.delayMs));
    }

    if (operationResponse.error) {
      return Promise.reject(new Error(operationResponse.error));
    }

    return { data: (operationResponse.data ?? {}) as GraphQLResponse['data'] };
  };

  if (request.operationKind === 'mutation') {
    mock.mutationRequestObserver?.(request, variables);
    const operationResponse = getOperationResponse();
    if (operationResponse) {
      return resolveOperationResponse(operationResponse);
    }
    if (mock.mutationError) {
      return Promise.reject(new Error(mock.mutationError));
    }
    if (mock.mutationLoading) {
      return new Promise(() => undefined);
    }

    return Promise.resolve({
      data: (mock.mutationResponse === undefined
        ? {}
        : mock.mutationResponse) as GraphQLResponse['data'],
      errors: mock.mutationGraphQLErrors?.map((error) =>
        typeof error === 'string' ? { message: error } : error,
      ),
    });
  }

  if (request.name.endsWith('NextPageQuery')) {
    mock.paginationRequestObserver?.(request, variables);
    const configuredResponse =
      mock.paginationResponses?.[
        Math.min(nextPaginationResponseIndex(), mock.paginationResponses.length - 1)
      ];
    if (configuredResponse?.error) {
      return Promise.reject(new Error(configuredResponse.error));
    }
    if (configuredResponse) {
      return Promise.resolve({ data: (configuredResponse.data ?? {}) as GraphQLResponse['data'] });
    }
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

  const operationResponse = getOperationResponse();
  if (operationResponse) {
    return resolveOperationResponse(operationResponse);
  }

  return Promise.resolve({ data: (mock.queryData ?? {}) as GraphQLResponse['data'] });
}
