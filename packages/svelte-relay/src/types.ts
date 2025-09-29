import type {
  CacheConfig as RelayCacheConfig,
  Disposable,
  FetchQueryFetchPolicy,
  GraphQLResponse,
  RecordSourceSelectorProxy,
  RequestParameters,
  Store,
  Variables,
} from 'relay-runtime';

export interface RelayEnvironmentConfig {
  network: {
    fetch: (
      params: RequestParameters,
      variables: Variables,
      cacheConfig?: CacheConfig,
      ssrFetch?: typeof globalThis.fetch,
    ) => Promise<GraphQLResponse>;
    subscribe?: (
      params: RequestParameters,
      variables: Variables,
      cacheConfig?: CacheConfig,
    ) => Disposable;
  };
  store?: Store;
}

export type CacheConfig = {
  networkCacheConfig?: RelayCacheConfig | null | undefined;
  fetchPolicy?: FetchQueryFetchPolicy | null | undefined;
} | null;

export interface QueryResult<TData = unknown> {
  data: TData | null;
  error: Error | null;
  loading: boolean;
  refetch: (variables?: Variables) => void;
}

export interface MutationResult<TData = unknown> {
  data: TData | null;
  error: Error | null;
  loading: boolean;
}

export interface FragmentResult<TData = unknown> {
  data: TData | null;
}

export interface SubscriptionResult<TData = unknown> {
  data: TData | null;
  error: Error | null;
}

export interface MutationConfig<TVariables = Variables, TData = unknown> {
  variables: TVariables;
  onCompleted?: (data: TData) => void;
  onError?: (error: Error) => void;
  optimisticResponse?: TData;
  optimisticUpdater?: (store: RecordSourceSelectorProxy) => void;
  updater?: (store: RecordSourceSelectorProxy, data: TData) => void;
}

export interface MutationFunction<TData = unknown, TVariables extends Variables = Variables> {
  (config: MutationConfig<TVariables, TData>): Promise<TData>;
  subscribe: (run: (value: MutationResult<TData>) => void) => () => void;
}
