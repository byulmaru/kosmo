import { useCallback, useMemo, useRef } from 'react';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { StructuredClientError } from '@/observability/client-error';
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
  paginationResponses?: StoryOperationResponse[];
  operationResponses?: Record<
    string,
    StoryOperationResponse | StoryOperationResponse[] | StoryOperationResponseSequence
  >;
  queryData?: unknown;
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
  children,
  mutationError,
  mutationGraphQLErrors,
  mutationLoading,
  mutationResponse,
  paginationError,
  paginationLoading,
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
      mutationResponse,
      paginationError,
      paginationLoading,
      paginationResponse,
      paginationResponses,
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

  return <RelayActorProvider createEnvironment={createEnvironment}>{children}</RelayActorProvider>;
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
    network: Network.create((request) =>
      executeStoryOperation(
        request,
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
      return Promise.reject(createStoryExpectedError(operationResponse.error));
    }

    return { data: (operationResponse.data ?? {}) as GraphQLResponse['data'] };
  };

  if (request.operationKind === 'mutation') {
    const operationResponse = getOperationResponse();
    if (operationResponse) {
      return resolveOperationResponse(operationResponse);
    }
    if (mock.mutationError) {
      return Promise.reject(createStoryExpectedError(mock.mutationError));
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
    const configuredResponse =
      mock.paginationResponses?.[
        Math.min(nextPaginationResponseIndex(), mock.paginationResponses.length - 1)
      ];
    if (configuredResponse?.error) {
      return Promise.reject(createStoryExpectedError(configuredResponse.error));
    }
    if (configuredResponse) {
      return Promise.resolve({ data: (configuredResponse.data ?? {}) as GraphQLResponse['data'] });
    }
    if (mock.paginationError) {
      return Promise.reject(
        createStoryExpectedError(
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

function createStoryExpectedError(message: string): StructuredClientError {
  return new StructuredClientError({
    code: 'NETWORK_REQUEST_FAILED',
    message,
    origin: 'transport',
    type: 'network',
  });
}
