import {
  CacheConfig,
  Environment,
  Network,
  RecordSource,
  RequestParameters,
  Store,
  Variables,
} from 'relay-runtime';
import { getContext, setContext } from 'svelte';
import type { RelayEnvironmentConfig } from './types.js';

const RELAY_CONTEXT_KEY = Symbol('relay-environment');

export function createRelayEnvironment(config: RelayEnvironmentConfig): Environment {
  // SSR fetch를 사용하는 enhanced fetch 함수
  const enhancedFetch = async (
    params: RequestParameters,
    variables: Variables,
    cacheConfig?: CacheConfig,
  ) => {
    return config.network.fetch(params, variables, cacheConfig);
  };

  const network = Network.create(enhancedFetch, config.network.subscribe);
  const store = new Store(new RecordSource());

  return new Environment({
    network,
    store,
  });
}

export function setRelayEnvironment(environment: Environment) {
  setContext(RELAY_CONTEXT_KEY, environment);
}

export function getRelayEnvironment(): Environment {
  const environment = getContext<Environment>(RELAY_CONTEXT_KEY);
  if (!environment) {
    throw new Error('Relay context not found');
  }
  return environment;
}
