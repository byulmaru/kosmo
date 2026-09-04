import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { RouteBoundaryHandle } from './RouteBoundary';

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

type RouteBoundaryProps = {
  children: ReactNode;
  loading: ReactNode;
  onRetry?: () => void;
  remountOnActorChange?: boolean;
  title: string;
};

let RouteBoundary: ForwardRefExoticComponent<
  RouteBoundaryProps & RefAttributes<RouteBoundaryHandle>
>;
let useRouteBoundary: () => { fetchKey: number; refetch: () => void; retry: () => void };
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
  const { fetchKey, refetch, retry } = useRouteBoundary();
  useEffect(() => {
    mountCount += 1;
    return () => {
      unmountCount += 1;
    };
  }, []);

  if (queryShouldThrow) {
    throw new Error('actor query failed');
  }

  return createElement('QueryProbe', {
    fetchKey,
    onRefetch: refetch,
    onRetry: retry,
  });
}

function renderBoundary(
  actorLifecycleKey: string,
  remountOnActorChange?: boolean,
  onRetry?: () => void,
  children: ReactNode = createElement(QueryProbe),
  ref?: RefAttributes<RouteBoundaryHandle>['ref'],
) {
  return createElement(
    ActorLifecycleContext.Provider,
    { value: actorLifecycleKey },
    createElement(RouteBoundary, {
      children,
      loading: null,
      onRetry,
      ref,
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
  it('owns the fetch key and only remounts actor-dependent query leaves', async () => {
    const handleRef: { current: RouteBoundaryHandle | null } = { current: null };

    await act(async () => {
      renderer = create(
        renderBoundary('actor-a', true, undefined, createElement(QueryProbe), handleRef),
      );
    });

    assert.equal(mountCount, 1);
    assert.equal(unmountCount, 0);
    assert.equal(queryProbe().props.fetchKey, 0);
    assert.ok(handleRef.current);

    await act(async () => handleRef.current?.refetch());

    assert.equal(queryProbe().props.fetchKey, 1);
    assert.equal(mountCount, 1);
    assert.equal(unmountCount, 0);

    await act(async () => handleRef.current?.retry());

    assert.equal(queryProbe().props.fetchKey, 2);
    assert.equal(mountCount, 1);
    assert.equal(unmountCount, 0);

    await act(async () => {
      renderer?.update(
        renderBoundary('actor-b', true, undefined, createElement(QueryProbe), handleRef),
      );
    });

    assert.equal(mountCount, 2);
    assert.equal(unmountCount, 1);
    assert.equal(queryProbe().props.fetchKey, 2);
  });

  it('resets an error boundary and advances the fetch key without remounting a healthy query leaf', async () => {
    const handleRef: { current: RouteBoundaryHandle | null } = { current: null };
    let recoveryCount = 0;
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryShouldThrow = true;
      await act(async () => {
        renderer = create(
          renderBoundary(
            'actor-a',
            true,
            () => recoveryCount++,
            createElement(QueryProbe),
            handleRef,
          ),
        );
      });

      assert.equal(renderer?.root.findAll((node) => String(node.type) === 'StateView').length, 1);
      assert.equal(mountCount, 0);
      assert.equal(unmountCount, 0);
      assert.ok(handleRef.current);

      queryShouldThrow = false;
      await act(async () => handleRef.current?.retry());

      assert.equal(queryProbe().props.fetchKey, 1);
      assert.equal(mountCount, 1);
      assert.equal(unmountCount, 0);
      assert.equal(recoveryCount, 1);
    } finally {
      console.error = originalConsoleError;
    }
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
