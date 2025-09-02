import { createOperationDescriptor, fetchQuery, getRequest } from 'relay-runtime';
import { getRelayEnvironment } from '../environment';
import type { Disposable, Environment, PayloadData, Variables } from 'relay-runtime';
import type { LoadedQuery } from '../load.js';

export interface QueryStore<TData> {
  subscribe: (run: (value: TData) => void) => () => void;
  refetch: (newVariables?: Variables) => void;
  loading: () => boolean;
  error: () => Error | null;
}

/**
 * createLoadedQuery로 생성된 쿼리를 사용하는 store
 * $query로 데이터에 직접 접근 가능
 */
export function usePreloadedQuery<TData = unknown, TVariables extends Variables = Variables>(
  loadedQuery: LoadedQuery<TData, TVariables>,
  environment?: Environment,
): QueryStore<TData> {
  const env = environment ?? getRelayEnvironment();
  const { query, variables, data } = loadedQuery;

  // Relay operation descriptor 생성
  const request = getRequest(query);
  const operation = createOperationDescriptor(request, variables);

  let currentError: Error | null = null;
  let currentLoading = false;
  let storeSubscription: Disposable | null = null;

  const subscribers = new Set<(value: TData) => void>();

  // 서버에서 가져온 데이터를 Relay store에 commit (hydration)
  env.commitPayload(operation, data as PayloadData);

  // Relay store에서 실시간 데이터 읽기
  function getCurrentData(): TData {
    const snapshot = env.lookup(operation.fragment);
    return snapshot.data as TData;
  }

  function notify() {
    const currentData = getCurrentData();
    subscribers.forEach((fn) => fn(currentData));
  }

  function executeQuery(vars: Variables) {
    currentLoading = true;
    currentError = null;
    notify();

    const observable = fetchQuery(env, query, vars);

    observable.subscribe({
      next: () => {
        // fetchQuery가 자동으로 Relay store에 commit함
        currentError = null;
        currentLoading = false;
        notify();
      },
      error: (error: Error) => {
        currentError = error;
        currentLoading = false;
        notify();
      },
    });
  }

  // Relay store 구독 시작
  function startStoreSubscription() {
    if (storeSubscription) {
      return;
    }

    storeSubscription = env.subscribe(env.lookup(operation.fragment), () => {
      // store가 변경될 때마다 notify
      notify();
    });
  }

  function stopStoreSubscription() {
    if (storeSubscription) {
      storeSubscription.dispose();
      storeSubscription = null;
    }
  }

  return {
    subscribe(run: (value: TData) => void) {
      // 즉시 현재 값으로 호출 (store contract 요구사항)
      run(getCurrentData());

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
    },
    refetch(newVariables?: Variables) {
      executeQuery(newVariables ?? variables);
    },
    loading() {
      return currentLoading;
    },
    error() {
      return currentError;
    },
  } as QueryStore<TData>;
}
