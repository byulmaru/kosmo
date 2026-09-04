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
let useRouteBoundary: () => { fetchKey: number; refetch: () => void };
let queryShouldThrow = false;
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
  const { fetchKey } = useRouteBoundary();
  if (queryShouldThrow) {
    throw new Error('route query failed');
  }

  return createElement('QueryProbe', { fetchKey });
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
  it('resets an error boundary and advances the fetch key through the fallback action', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryShouldThrow = true;
      await act(async () => {
        renderer = create(renderBoundary());
      });

      assert.equal(renderer?.root.findAll((node) => String(node.type) === 'StateView').length, 1);
      const fallback = renderer?.root.findAll((node) => String(node.type) === 'StateView')[0];
      assert.ok(fallback);

      queryShouldThrow = false;
      await act(async () => fallback.props.onAction());

      assert.equal(queryProbe().props.fetchKey, 1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
