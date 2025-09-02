import relayRuntime from 'relay-runtime';

export { createRelayEnvironment, getRelayEnvironment, setRelayEnvironment } from './environment.js';
export type { LoadedQuery } from './load.js';
export { loadQuery } from './load.js';
export type { FragmentStore } from './stores/fragment.js';
export { useFragment } from './stores/fragment.js';
export type { LazyQueryStore } from './stores/lazy-query.js';
export { useLazyLoadQuery } from './stores/lazy-query.js';
export { useMutation } from './stores/mutation.js';
export type { QueryStore } from './stores/preloaded-query.js';
export { usePreloadedQuery } from './stores/preloaded-query.js';
export type {
  FragmentResult,
  MutationFunction,
  MutationResult,
  QueryResult,
  RelayEnvironmentConfig,
} from './types.js';

export const graphql = relayRuntime.graphql;
