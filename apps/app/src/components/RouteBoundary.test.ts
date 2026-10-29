import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { RouteBoundaryHandle } from './RouteBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule(new URL('./ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

type RouteBoundaryProps = {
  children: ReactNode;
  loading: ReactNode;
  title: string;
};

let RouteBoundary: ForwardRefExoticComponent<
  RouteBoundaryProps & RefAttributes<RouteBoundaryHandle>
>;
let useRouteBoundary: () => {
  fetchKey: string;
  fetchPolicy: 'store-or-network' | 'network-only';
  refetch: () => void;
};
let queryShouldThrow = false;
let observedFetchKey = '';
let observedFetchPolicy: 'store-or-network' | 'network-only' = 'store-or-network';
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

function QueryProbe() {
  const { fetchKey, fetchPolicy, refetch } = useRouteBoundary();
  observedFetchKey = fetchKey;
  observedFetchPolicy = fetchPolicy;
  if (queryShouldThrow) {
    throw new Error('route query failed');
  }

  return createElement('QueryProbe', { fetchKey, fetchPolicy, refetch });
}

function renderBoundary(
  children: ReactNode = createElement(QueryProbe),
  ref?: RefAttributes<RouteBoundaryHandle>['ref'],
) {
  return createElement(RouteBoundary, {
    children,
    loading: null,
    ref,
    title: 'query failed',
  });
}

function queryProbe() {
  assert.ok(renderer);
  const probe = renderer.root.findAll((node) => String(node.type) === 'QueryProbe')[0];
  assert.ok(probe);
  return probe;
}

describe('RouteBoundary local query lifecycle', () => {
  it('keeps the fetch key stable through ordinary rerenders', async () => {
    await act(async () => {
      renderer = create(renderBoundary());
    });

    const initialFetchKey = queryProbe().props.fetchKey;
    assert.equal(queryProbe().props.fetchPolicy, 'store-or-network');

    await act(async () => {
      renderer?.update(renderBoundary());
    });

    assert.equal(queryProbe().props.fetchKey, initialFetchKey);
    assert.equal(queryProbe().props.fetchPolicy, 'store-or-network');
  });

  it('assigns a new fetch key for an explicit refetch in the same millisecond', async () => {
    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    const randomValues = [0.125, 0.25];
    Date.now = () => 1_700_000_000_000;
    Math.random = () => randomValues.shift() ?? 0;

    try {
      await act(async () => {
        renderer = create(renderBoundary());
      });

      const initialFetchKey = queryProbe().props.fetchKey;
      assert.equal(typeof initialFetchKey, 'string');
      assert.equal(queryProbe().props.fetchPolicy, 'store-or-network');
      await act(async () => queryProbe().props.refetch());

      const refetchedKey = queryProbe().props.fetchKey;
      assert.notEqual(refetchedKey, initialFetchKey);
      assert.equal(queryProbe().props.fetchPolicy, 'network-only');
    } finally {
      Date.now = originalDateNow;
      Math.random = originalRandom;
    }
  });

  it('resets an error boundary and advances the fetch key through the fallback action', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryShouldThrow = true;
      await act(async () => {
        renderer = create(renderBoundary());
      });

      const failedFetchKey = observedFetchKey;
      assert.equal(observedFetchPolicy, 'store-or-network');
      assert.equal(renderer?.root.findAll((node) => String(node.type) === 'StateView').length, 1);
      const fallback = renderer?.root.findAll((node) => String(node.type) === 'StateView')[0];
      assert.ok(fallback);

      queryShouldThrow = false;
      await act(async () => fallback.props.onAction());

      const retriedFetchKey = queryProbe().props.fetchKey;
      assert.notEqual(retriedFetchKey, failedFetchKey);
      assert.equal(queryProbe().props.fetchPolicy, 'network-only');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('assigns a fresh fetch key after the boundary remounts', async () => {
    await act(async () => {
      renderer = create(renderBoundary());
    });

    const firstMountKey = queryProbe().props.fetchKey;
    assert.equal(queryProbe().props.fetchPolicy, 'store-or-network');

    await act(async () => renderer?.unmount());
    renderer = null;

    await act(async () => {
      renderer = create(renderBoundary());
    });

    const remountedKey = queryProbe().props.fetchKey;
    assert.notEqual(remountedKey, firstMountKey);
    assert.equal(queryProbe().props.fetchPolicy, 'store-or-network');
  });
});
