import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ActorLifecycleContext = createContext('actor-a');
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule(new URL('../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => useContext(ActorLifecycleContext),
});
mockModule(new URL('./ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let RouteBoundary: ComponentType<{
  children: ReactNode;
  loading: ReactNode;
  onRetry?: () => void;
  remountOnActorChange?: boolean;
  title: string;
}>;
let useRouteBoundary: () => { fetchKey: number; retry: () => void };
let mountCount = 0;
let unmountCount = 0;
let queryShouldThrow = false;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
});

beforeEach(() => {
  mountCount = 0;
  unmountCount = 0;
  queryShouldThrow = false;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

function QueryProbe() {
  const { fetchKey, retry } = useRouteBoundary();
  useEffect(() => {
    mountCount += 1;
    return () => {
      unmountCount += 1;
    };
  }, []);

  if (queryShouldThrow) {
    throw new Error('actor query failed');
  }

  return createElement('QueryProbe', { fetchKey, onRetry: retry });
}

function renderBoundary(
  actorLifecycleKey: string,
  remountOnActorChange?: boolean,
  onRetry?: () => void,
) {
  return createElement(
    ActorLifecycleContext.Provider,
    { value: actorLifecycleKey },
    createElement(RouteBoundary, {
      children: createElement(QueryProbe),
      loading: null,
      onRetry,
      remountOnActorChange,
      title: 'query failed',
    }),
  );
}

function queryProbe() {
  assert.ok(renderer);
  const probe = renderer.root.findAll((node) => String(node.type) === 'QueryProbe')[0];
  assert.ok(probe);
  return probe;
}

describe('RouteBoundary actor lifecycle', () => {
  it('remounts actor-dependent query leaves while preserving local retry state', async () => {
    await act(async () => {
      renderer = create(renderBoundary('actor-a'));
    });

    assert.equal(mountCount, 1);
    assert.equal(unmountCount, 0);
    assert.equal(queryProbe().props.fetchKey, 0);

    await act(async () => queryProbe().props.onRetry());

    assert.equal(mountCount, 2);
    assert.equal(unmountCount, 1);
    assert.equal(queryProbe().props.fetchKey, 1);

    await act(async () => {
      renderer?.update(renderBoundary('actor-b'));
    });

    assert.equal(mountCount, 3);
    assert.equal(unmountCount, 2);
    assert.equal(queryProbe().props.fetchKey, 1);
  });

  it('keeps the shell query subtree mounted when actor lifecycle changes opt out', async () => {
    await act(async () => {
      renderer = create(renderBoundary('actor-a', false));
    });

    await act(async () => {
      renderer?.update(renderBoundary('actor-b', false));
    });

    assert.equal(mountCount, 1);
    assert.equal(unmountCount, 0);
    assert.equal(queryProbe().props.fetchKey, 0);
  });

  it('resets an opted-out shell error fallback without remounting healthy shell state', async () => {
    let recoveryCount = 0;
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryShouldThrow = true;
      await act(async () => {
        renderer = create(renderBoundary('actor-a', false, () => recoveryCount++));
      });

      queryShouldThrow = false;
      await act(async () => {
        renderer?.update(renderBoundary('actor-b', false, () => recoveryCount++));
      });

      assert.equal(renderer?.root.findAll((node) => String(node.type) === 'StateView').length, 0);
      assert.equal(mountCount, 1);
      assert.equal(unmountCount, 0);
      assert.equal(queryProbe().props.fetchKey, 0);
      assert.equal(recoveryCount, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
