import { fetchQuery, getFragment, getSelector } from 'relay-runtime';
import { getRelayEnvironment } from '../environment';
import type { Disposable, Environment, GraphQLTaggedNode, Variables } from 'relay-runtime';

interface KeyType {
  readonly ' $data'?: unknown;
  readonly ' $fragmentSpreads': unknown;
}

// Relay 타입에서 실제 response data 추출
type ExtractResponseData<TKey extends KeyType> = NonNullable<TKey[' $data']>;

export interface RefetchableFragmentStore<TData, TVariables extends Variables = Variables> {
  subscribe: (run: (value: TData) => void) => () => void;
  refetch: (variables?: TVariables) => Promise<TData>;
  isRefetching: () => boolean;
}

export function useRefetchableFragment<
  TKey extends KeyType,
  TVariables extends Variables = Variables,
>(
  fragment: GraphQLTaggedNode,
  fragmentRef: TKey,
  environment?: Environment,
): RefetchableFragmentStore<ExtractResponseData<TKey>, TVariables> {
  const env = environment ?? getRelayEnvironment();

  type TData = ExtractResponseData<TKey>;

  let currentValue: TData;
  let isCurrentlyRefetching = false;

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
                // store가 변경될 때마다 notify
                notify();
              }),
            );
          });
        } else {
          // 다른 stores와 똑같은 패턴으로 Relay store 구독
          storeSubscriptions.add(
            env.subscribe(env.lookup(selector), () => {
              // store가 변경될 때마다 notify
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

  // Refetch 함수
  async function refetch(variables?: TVariables): Promise<TData> {
    if (isCurrentlyRefetching) {
      throw new Error('Refetch already in progress');
    }

    try {
      isCurrentlyRefetching = true;

      // Fragment에서 refetch query 정보 가져오기
      const fragmentNode = getFragment(fragment);
      const metadata = fragmentNode.metadata as Record<string, unknown> | undefined;
      const refetchableMetadata = metadata?.refetch as Record<string, unknown> | undefined;

      if (!refetchableMetadata) {
        throw new Error(
          'Fragment is not refetchable. Add @refetchable directive to your fragment.',
        );
      }

      const refetchQuery =
        refetchableMetadata.operation || refetchableMetadata.fragmentPathInResult;

      if (!refetchQuery || typeof refetchQuery === 'string') {
        throw new Error('Refetch query not found in fragment metadata or invalid format.');
      }

      // Fragment ref에서 id 추출 (node refetch를 위해)
      const fragmentData = getCurrentData();
      const nodeId = (fragmentData as Record<string, unknown>)?.id;

      if (!nodeId || typeof nodeId !== 'string') {
        throw new Error('Fragment data must have an "id" field for refetching.');
      }

      // Refetch variables에 id 추가
      const refetchVariables = {
        id: nodeId,
        ...variables,
      };

      // Query 실행 - 결과는 자동으로 Relay store에 커밋됨
      await fetchQuery(env, refetchQuery as GraphQLTaggedNode, refetchVariables).toPromise();

      // Fragment 데이터 다시 읽기
      const newData = getCurrentData();
      return newData;
    } catch (error) {
      console.error('Refetch failed:', error);
      throw error;
    } finally {
      isCurrentlyRefetching = false;
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

  function isRefetching() {
    return isCurrentlyRefetching;
  }

  // 초기 데이터 설정
  try {
    currentValue = getCurrentData();
  } catch (error) {
    console.error('Failed to initialize refetchable fragment data:', error);
    throw error;
  }

  return {
    subscribe,
    refetch,
    isRefetching,
  };
}
