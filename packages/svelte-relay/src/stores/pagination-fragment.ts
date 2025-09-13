import { fetchQuery, getFragment, getSelector } from 'relay-runtime';
import { getRelayEnvironment } from '../environment';
import type { Disposable, Environment, GraphQLTaggedNode, Variables } from 'relay-runtime';

interface KeyType {
  readonly ' $data'?: unknown;
  readonly ' $fragmentSpreads': unknown;
}

// Relay 타입에서 실제 response data 추출
type ExtractResponseData<TKey extends KeyType> = NonNullable<TKey[' $data']>;

export interface PaginationFragmentStore<TData, TVariables extends Variables = Variables> {
  subscribe: (run: (value: TData) => void) => () => void;
  loadNext: (count: number) => void;
  loadPrevious: (count: number) => void;
  refetch: (variables?: TVariables) => Promise<TData>;
}

export function usePaginationFragment<
  TKey extends KeyType,
  TVariables extends Variables = Variables,
>(
  fragment: GraphQLTaggedNode,
  fragmentRef: TKey,
  environment?: Environment,
): PaginationFragmentStore<ExtractResponseData<TKey>, TVariables> {
  const env = environment ?? getRelayEnvironment();

  type TData = ExtractResponseData<TKey>;

  let currentValue: TData;
  let isCurrentlyLoadingNext = false;
  let isCurrentlyLoadingPrevious = false;

  const subscribers = new Set<(value: TData) => void>();
  const storeSubscriptions: Set<Disposable> = new Set();

  // Fragment 데이터 읽기
  function getCurrentData(): TData {
    if (!fragmentRef) {
      throw new Error('Fragment ref is required');
    }

    try {
      // Fragment selector 생성해서 store에서 데이터 읽기
      const selector = getSelector(getFragment(fragment), fragmentRef);

      if (!selector) {
        throw new Error('Failed to create fragment selector');
      }

      if (selector.kind === 'PluralReaderSelector') {
        // Plural fragment의 경우 배열 데이터 반환
        const snapshots = selector.selectors.map((sel) => env.lookup(sel));
        const data = snapshots.map((snapshot) => snapshot.data);
        if (data.some((item) => item == null)) {
          throw new Error('Fragment data is missing from store');
        }
        return data as TData;
      } else {
        // Singular fragment의 경우 단일 데이터 반환
        const snapshot = env.lookup(selector);
        if (snapshot.data == null) {
          throw new Error('Fragment data is missing from store');
        }
        return snapshot.data as TData;
      }
    } catch (error) {
      console.error('Failed to read fragment data:', error);
      throw error;
    }
  }

  // Connection에서 PageInfo 추출
  function getPageInfo() {
    const data = getCurrentData() as Record<string, unknown>;

    // Connection field 찾기 (일반적으로 하나의 connection field가 있음)
    for (const key in data) {
      const value = data[key];
      if (value && typeof value === 'object' && 'pageInfo' in value) {
        return value.pageInfo as {
          hasNextPage: boolean;
          hasPreviousPage: boolean;
          startCursor?: string;
          endCursor?: string;
        };
      }
    }

    throw new Error('No connection field with pageInfo found in fragment data');
  }

  function notify() {
    const data = getCurrentData();
    currentValue = data;
    subscribers.forEach((fn) => fn(currentValue));
  }

  // Relay store 구독 시작
  function startStoreSubscription() {
    if (storeSubscriptions.size > 0 || !fragmentRef) {
      return;
    }

    try {
      // Fragment selector 생성
      const selector = getSelector(getFragment(fragment), fragmentRef);

      if (selector) {
        if (selector.kind === 'PluralReaderSelector') {
          selector.selectors.forEach((selector) => {
            storeSubscriptions.add(
              env.subscribe(env.lookup(selector), () => {
                notify();
              }),
            );
          });
        } else {
          storeSubscriptions.add(
            env.subscribe(env.lookup(selector), () => {
              notify();
            }),
          );
        }
      }
    } catch (error) {
      console.warn('Failed to subscribe to fragment:', error);
    }
  }

  function stopStoreSubscription() {
    storeSubscriptions.forEach((subscription) => subscription.dispose());
    storeSubscriptions.clear();
  }

  // Fragment metadata에서 refetch query 가져오기
  function getRefetchQuery() {
    const fragmentNode = getFragment(fragment);
    const metadata = fragmentNode.metadata as Record<string, unknown> | undefined;
    const refetchableMetadata = metadata?.refetch as Record<string, unknown> | undefined;

    if (!refetchableMetadata) {
      throw new Error('Fragment is not refetchable. Add @refetchable directive to your fragment.');
    }

    const refetchQuery = refetchableMetadata.operation || refetchableMetadata.fragmentPathInResult;

    if (!refetchQuery || typeof refetchQuery === 'string') {
      throw new Error('Refetch query not found in fragment metadata or invalid format.');
    }

    return refetchQuery as GraphQLTaggedNode;
  }

  // 다음 페이지 로드
  function loadNext(count: number): void {
    if (isCurrentlyLoadingNext) {
      console.warn('Already loading next page');
      return;
    }

    try {
      isCurrentlyLoadingNext = true;
      const pageInfo = getPageInfo();

      if (!pageInfo.hasNextPage) {
        console.warn('No next page available');
        return;
      }

      const refetchQuery = getRefetchQuery();

      // Fragment ref에서 node ID 추출
      const nodeId = (fragmentRef as Record<string, unknown>)?.id;

      const variables = {
        id: nodeId,
        count,
        cursor: pageInfo.endCursor,
      };

      // Query 실행 - 결과는 자동으로 Relay store에 커밋됨 (connection merge)
      fetchQuery(env, refetchQuery, variables).subscribe({
        next: () => {
          // fetchQuery가 자동으로 Relay store에 commit함
          isCurrentlyLoadingNext = false;
          notify();
        },
        error: (error: Error) => {
          console.error('Load next failed:', error);
          isCurrentlyLoadingNext = false;
          notify();
        },
      });
    } catch (error) {
      console.error('Load next failed:', error);
      isCurrentlyLoadingNext = false;
    }
  }

  // 이전 페이지 로드
  function loadPrevious(count: number): void {
    if (isCurrentlyLoadingPrevious) {
      console.warn('Already loading previous page');
      return;
    }

    try {
      isCurrentlyLoadingPrevious = true;
      const pageInfo = getPageInfo();

      if (!pageInfo.hasPreviousPage) {
        console.warn('No previous page available');
        return;
      }

      const refetchQuery = getRefetchQuery();

      // Fragment ref에서 node ID 추출
      const nodeId = (fragmentRef as Record<string, unknown>)?.id;

      const variables = {
        id: nodeId,
        count,
        cursor: pageInfo.startCursor,
      };

      // Query 실행
      fetchQuery(env, refetchQuery, variables).subscribe({
        next: () => {
          isCurrentlyLoadingPrevious = false;
          notify();
        },
        error: (error: Error) => {
          console.error('Load previous failed:', error);
          isCurrentlyLoadingPrevious = false;
          notify();
        },
      });
    } catch (error) {
      console.error('Load previous failed:', error);
      isCurrentlyLoadingPrevious = false;
    }
  }

  // 전체 refetch
  async function refetch(variables?: TVariables): Promise<TData> {
    try {
      const refetchQuery = getRefetchQuery();

      // Fragment ref에서 node ID 추출
      const nodeId = (fragmentRef as Record<string, unknown>)?.id;

      const refetchVariables = {
        id: nodeId,
        ...variables,
      };

      // Query 실행
      await fetchQuery(env, refetchQuery, refetchVariables).toPromise();

      // Fragment 데이터 다시 읽기
      const newData = getCurrentData();
      return newData;
    } catch (error) {
      console.error('Refetch failed:', error);
      throw error;
    }
  }

  function subscribe(run: (value: TData) => void) {
    // 즉시 현재 값으로 호출 (store contract 요구사항)
    run(currentValue);

    subscribers.add(run);

    // 첫 번째 구독자가 생기면 Relay store 구독 시작
    if (subscribers.size === 1) {
      startStoreSubscription();
    }

    // unsubscribe 함수 반환
    return () => {
      subscribers.delete(run);

      // 마지막 구독자가 사라지면 Relay store 구독 중단
      if (subscribers.size === 0) {
        stopStoreSubscription();
      }
    };
  }

  // 초기 데이터 설정
  try {
    currentValue = getCurrentData();
  } catch (error) {
    console.error('Failed to initialize pagination fragment data:', error);
    throw error;
  }

  return {
    subscribe,
    loadNext,
    loadPrevious,
    refetch,
  };
}
