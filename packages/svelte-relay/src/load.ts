import { fetchQuery } from 'relay-runtime';
import type { Environment, GraphQLTaggedNode, Variables } from 'relay-runtime';

export interface LoadedQuery<TData = unknown, TVariables extends Variables = Variables> {
  query: GraphQLTaggedNode;
  variables: TVariables;
  data: TData;
}

// Relay 타입에서 실제 response data 추출
type ExtractResponseData<T> = T extends { response: infer R } ? R : T;

/**
 * SvelteKit load 함수에서 서버사이드 쿼리 실행 (immediate만 지원)
 * SSR fetch를 받아서 쿠키/헤더 자동 포함
 */
export async function loadQuery<TQuery = unknown, TVariables extends Variables = Variables>(
  environment: Environment,
  query: GraphQLTaggedNode,
  variables: TVariables = {} as TVariables,
): Promise<LoadedQuery<ExtractResponseData<TQuery>, TVariables>> {
  try {
    const data = await fetchQuery(environment, query, variables).toPromise();

    return {
      query,
      variables,
      data: data as ExtractResponseData<TQuery>,
    };
  } catch (error) {
    console.error('Load query failed:', error);
    throw error;
  }
}
