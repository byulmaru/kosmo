import { createContext, useContext } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

type MutationConfig = {
  onCompleted?: (response: unknown, errors?: ReadonlyArray<unknown> | null) => void;
  onError?: (error: Error) => void;
};

type RelayMockValue = {
  mutationError?: string;
  mutationLoading?: boolean;
  mutationResponse?: unknown;
  queryData?: unknown;
};

type PaginationMetadata = {
  hasNext?: boolean;
  isLoadingNext?: boolean;
  nextPageError?: boolean;
};

const RelayMockContext = createContext<RelayMockValue>({});

export function RelayStoryProvider({ children, ...value }: PropsWithChildren<RelayMockValue>) {
  return <RelayMockContext.Provider value={value}>{children}</RelayMockContext.Provider>;
}

export function RelayEnvironmentProvider({ children }: { children: ReactNode }) {
  return children;
}

export function graphql(strings: TemplateStringsArray) {
  return strings.join('');
}

export function useFragment<T>(_fragment: unknown, key: T): T {
  return key;
}

export function useLazyLoadQuery<T>(): T {
  return useContext(RelayMockContext).queryData as T;
}

export function useMutation() {
  const mock = useContext(RelayMockContext);
  const commit = (config: MutationConfig) => {
    if (mock.mutationError) {
      config.onError?.(new Error(mock.mutationError));
      return;
    }

    config.onCompleted?.(mock.mutationResponse ?? {}, null);
  };

  return [commit, Boolean(mock.mutationLoading)] as const;
}

export function usePaginationFragment<T>(_fragment: unknown, key: T) {
  const metadata = (key as T & { __story?: PaginationMetadata }).__story ?? {};

  return {
    data: key,
    hasNext: Boolean(metadata.hasNext),
    isLoadingNext: Boolean(metadata.isLoadingNext),
    loadNext: (_count: number, options?: { onComplete?: (error: Error | null) => void }) =>
      options?.onComplete?.(metadata.nextPageError ? new Error('다음 페이지 오류') : null),
  };
}
