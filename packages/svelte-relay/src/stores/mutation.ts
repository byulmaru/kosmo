import { commitMutation } from 'relay-runtime';
import { getRelayEnvironment } from '../environment';
import type { Environment, GraphQLTaggedNode, Variables } from 'relay-runtime';
import type { MutationConfig, MutationFunction, MutationResult } from '../types.js';

// Relay 타입에서 실제 response data 추출
type ExtractResponseData<T> = T extends { response: infer R } ? R : T;

export function useMutation<TMutation = unknown, TVariables extends Variables = Variables>(
  mutation: GraphQLTaggedNode,
  environment?: Environment,
): MutationFunction<ExtractResponseData<TMutation>, TVariables> {
  const env = environment ?? getRelayEnvironment();

  type TData = ExtractResponseData<TMutation>;

  let currentValue: MutationResult<TData> = {
    data: null,
    error: null,
    loading: false,
  };

  const subscribers = new Set<(value: MutationResult<TData>) => void>();

  function subscribe(run: (value: MutationResult<TData>) => void) {
    run(currentValue);
    subscribers.add(run);

    return () => {
      subscribers.delete(run);
    };
  }

  function executeMutation(config: MutationConfig<TVariables, TData>): Promise<TData> {
    currentValue = { data: null, error: null, loading: true };
    subscribers.forEach((run) => run(currentValue));

    return new Promise((resolve, reject) => {
      commitMutation(env, {
        mutation,
        variables: config.variables,
        onCompleted: (data, errors) => {
          const error = errors && errors.length > 0 ? new Error(errors[0].message) : null;

          currentValue = {
            data: error ? null : (data as TData),
            error,
            loading: false,
          };
          subscribers.forEach((run) => run(currentValue));

          if (error) {
            config.onError?.(error);
            reject(error);
          } else {
            config.onCompleted?.(data as TData);
            resolve(data as TData);
          }
        },
        onError: (error: Error) => {
          currentValue = {
            data: null,
            error,
            loading: false,
          };
          subscribers.forEach((run) => run(currentValue));

          config.onError?.(error);
          reject(error);
        },

        optimisticResponse: config.optimisticResponse,
        optimisticUpdater: config.optimisticUpdater,
        updater: config.updater,
      });
    });
  }

  // 함수에 store 메서드 추가
  executeMutation.subscribe = subscribe;

  return executeMutation;
}
