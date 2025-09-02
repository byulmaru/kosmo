import { getFragment, getSelector } from 'relay-runtime';
import { getRelayEnvironment } from '../environment';
import type { Disposable, Environment, GraphQLTaggedNode } from 'relay-runtime';

interface KeyType {
  readonly ' $data'?: unknown;
  readonly ' $fragmentSpreads': unknown;
}

// Relay 타입에서 실제 response data 추출
type ExtractResponseData<TKey extends KeyType> = NonNullable<TKey[' $data']>;

export interface FragmentStore<TData> {
  subscribe: (run: (value: TData) => void) => () => void;
}

export function useFragment<TKey extends KeyType>(
  fragment: GraphQLTaggedNode,
  fragmentRef: TKey,
  environment?: Environment,
): FragmentStore<ExtractResponseData<TKey>> {
  const env = environment ?? getRelayEnvironment();

  type TData = ExtractResponseData<TKey>;

  let currentValue: TData;

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
    console.error('Failed to initialize fragment data:', error);
    throw error;
  }

  return { subscribe };
}
