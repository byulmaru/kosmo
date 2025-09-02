import { createOperationDescriptor, fetchQuery, getRequest } from 'relay-runtime';
import { getRelayEnvironment } from '../environment';
import type { Disposable, Environment, GraphQLTaggedNode, Variables } from 'relay-runtime';

export interface LazyQueryStore<TData> {
  subscribe: (run: (value: TData | null) => void) => () => void;
  execute: (newVariables?: Variables) => void;
  loading: () => boolean;
  error: () => Error | null;
}

/**
 * 클라이언트에서 수동으로 실행하는 lazy query
 * useLazyLoadQuery와 유사
 */
export function useLazyLoadQuery<TData = unknown, TVariables extends Variables = Variables>(
  query: GraphQLTaggedNode,
  variables: TVariables = {} as TVariables,
  environment?: Environment,
): LazyQueryStore<TData> {
  const env = environment ?? getRelayEnvironment();

  // Relay operation descriptor 생성
  const request = getRequest(query);
  let operation = createOperationDescriptor(request, variables);

  let currentError: Error | null = null;
  let currentLoading = false;
  let hasExecuted = false;
  let storeSubscription: Disposable | null = null;

  const subscribers = new Set<(value: TData | null) => void>();

  // Relay store에서 실시간 데이터 읽기
  function getCurrentData(): TData | null {
    if (!hasExecuted) {
      return null;
    }
    const snapshot = env.lookup(operation.fragment);
    return snapshot.data as TData;
  }

  function notify() {
    const currentData = getCurrentData();
    subscribers.forEach((fn) => fn(currentData));
  }

  // Relay store 구독 시작
  function startStoreSubscription() {
    if (storeSubscription || !hasExecuted) {
      return;
    }

    storeSubscription = env.subscribe(env.lookup(operation.fragment), () => {
      notify();
    });
  }

  function stopStoreSubscription() {
    if (storeSubscription) {
      storeSubscription.dispose();
      storeSubscription = null;
    }
  }

  function executeQuery(vars: Variables) {
    currentLoading = true;
    currentError = null;
    hasExecuted = true;
    notify();

    // 새 operation descriptor 생성 (variables가 바뀔 수 있음)
    const newRequest = getRequest(query);
    const newOperation = createOperationDescriptor(newRequest, vars);

    const observable = fetchQuery(env, query, vars);

    observable.subscribe({
      next: () => {
        currentError = null;
        currentLoading = false;

        // fetchQuery가 자동으로 store에 commit하지만,
        // operation을 업데이트해서 올바른 데이터를 구독하도록 함
        operation = newOperation;

        // 처음 실행 후 store 구독 시작
        if (subscribers.size > 0) {
          // 기존 구독 정리 후 새로운 operation으로 구독
          stopStoreSubscription();
          startStoreSubscription();
        }

        notify();
      },
      error: (error: Error) => {
        currentError = error;
        currentLoading = false;
        notify();
      },
    });
  }

  return {
    subscribe(run: (value: TData | null) => void) {
      // 즉시 현재 값으로 호출
      run(getCurrentData());

      subscribers.add(run);

      // 이미 실행된 상태면 store 구독 시작
      if (hasExecuted && subscribers.size === 1) {
        startStoreSubscription();
      }

      return () => {
        subscribers.delete(run);

        // 마지막 구독자가 사라지면 store 구독 중단
        if (subscribers.size === 0) {
          stopStoreSubscription();
        }
      };
    },
    execute(newVariables?: Variables) {
      executeQuery(newVariables ?? variables);
    },
    loading() {
      return currentLoading;
    },
    error() {
      return currentError;
    },
  };
}
