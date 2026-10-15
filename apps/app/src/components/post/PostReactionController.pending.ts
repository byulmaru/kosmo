import type { Environment } from 'relay-runtime';

type Listener = () => void;

type PendingState = {
  readonly pendingByPostId: Map<string, readonly string[]>;
  readonly listenersByPostId: Map<string, Set<Listener>>;
};

const statesByEnvironment = new WeakMap<Environment, PendingState>();
const emptyPendingTypes: readonly string[] = [];

function getState(environment: Environment): PendingState {
  const existing = statesByEnvironment.get(environment);
  if (existing) {
    return existing;
  }

  const state: PendingState = {
    pendingByPostId: new Map(),
    listenersByPostId: new Map(),
  };
  statesByEnvironment.set(environment, state);
  return state;
}

function publish(state: PendingState, postId: string) {
  state.listenersByPostId.get(postId)?.forEach((listener) => listener());
}

export function getReactionPendingSnapshot(
  environment: Environment,
  postId: string,
): readonly string[] {
  return getState(environment).pendingByPostId.get(postId) ?? emptyPendingTypes;
}

export function getReactionPendingServerSnapshot(): readonly string[] {
  return emptyPendingTypes;
}

export function subscribeReactionPending(
  environment: Environment,
  postId: string,
  listener: Listener,
): () => void {
  const state = getState(environment);
  const listeners = state.listenersByPostId.get(postId) ?? new Set<Listener>();
  listeners.add(listener);
  state.listenersByPostId.set(postId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      state.listenersByPostId.delete(postId);
    }
  };
}

export function tryStartReactionPending(
  environment: Environment,
  postId: string,
  type: string,
): boolean {
  const state = getState(environment);
  const current = state.pendingByPostId.get(postId) ?? emptyPendingTypes;
  if (current.includes(type)) {
    return false;
  }

  state.pendingByPostId.set(postId, [...current, type]);
  publish(state, postId);
  return true;
}

export function finishReactionPending(environment: Environment, postId: string, type: string) {
  const state = getState(environment);
  const current = state.pendingByPostId.get(postId);
  if (!current || !current.includes(type)) {
    return;
  }

  const next = current.filter((pendingType) => pendingType !== type);
  if (next.length === 0) {
    state.pendingByPostId.delete(postId);
  } else {
    state.pendingByPostId.set(postId, next);
  }
  publish(state, postId);
}
