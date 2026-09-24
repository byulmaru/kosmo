import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  GuardedNavigationAction,
  NavigationGuardProvider as NavigationGuardProviderExport,
  NavigationRequestHandler,
  useNavigationGuard as useNavigationGuardExport,
} from './NavigationGuardContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type NavigationEventLike = {
  cancelable: boolean;
  destination: { key: string | null; sameDocument: boolean };
  info?: unknown;
  navigationType: string;
  preventDefault: ReturnType<typeof mock.fn>;
};

const platform: { OS: 'web' } = { OS: 'web' };
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: platform });

let NavigationGuardProvider: typeof NavigationGuardProviderExport;
let useNavigationGuard: typeof useNavigationGuardExport;
let renderer: ReactTestRenderer | null = null;
let localRequest: NavigationRequestHandler | undefined;

before(async () => {
  ({ NavigationGuardProvider, useNavigationGuard } = await import('./NavigationGuardContext'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  localRequest = undefined;
  mock.restoreAll();
});

function GuardRegistrar({ handler }: { handler: NavigationRequestHandler }) {
  const { register } = useNavigationGuard();
  useEffect(() => register(handler), [handler, register]);
  return null;
}

function LocalRequestProbe() {
  localRequest = useNavigationGuard().request;
  return null;
}

describe('NavigationGuardProvider', () => {
  it('supported same-document traverse는 preventDefault 뒤 승인된 destination으로 재개하고 bypass한다', async () => {
    const listeners = new Set<(event: NavigationEventLike) => void>();
    const traversals: Array<{ key: string; info: unknown }> = [];
    const navigation = {
      addEventListener: (_type: string, listener: (event: NavigationEventLike) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: NavigationEventLike) => void) => {
        listeners.delete(listener);
      },
      traverseTo: (key: string, options: { info: unknown }) => {
        traversals.push({ key, info: options.info });
        return { finished: Promise.resolve() };
      },
    };
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { navigation },
    });

    try {
      let pendingAction: GuardedNavigationAction | null = null;
      const guard = mock.fn((action: GuardedNavigationAction) => {
        pendingAction = action;
        return true;
      });
      await act(async () => {
        renderer = create(
          createElement(
            NavigationGuardProvider,
            null,
            createElement(GuardRegistrar, { handler: guard }),
          ),
        );
      });

      const event: NavigationEventLike = {
        cancelable: true,
        destination: { key: 'destination-key', sameDocument: true },
        navigationType: 'traverse',
        preventDefault: mock.fn(),
      };
      listeners.forEach((listener) => listener(event));

      assert.equal(guard.mock.callCount(), 1);
      assert.equal(event.preventDefault.mock.callCount(), 1);
      assert.equal(traversals.length, 0);
      assert.ok(pendingAction);

      await act(async () => pendingAction?.());
      assert.equal(traversals.length, 1);
      const traversal = traversals[0];
      assert.ok(traversal);
      assert.equal(traversal.key, 'destination-key');
      assert.equal(typeof traversal.info, 'symbol');

      const bypassEvent: NavigationEventLike = {
        cancelable: true,
        destination: { key: 'destination-key', sameDocument: true },
        info: traversal.info,
        navigationType: 'traverse',
        preventDefault: mock.fn(),
      };
      listeners.forEach((listener) => listener(bypassEvent));

      assert.equal(guard.mock.callCount(), 1);
      assert.equal(bypassEvent.preventDefault.mock.callCount(), 0);

      await act(async () => renderer?.unmount());
      renderer = null;
      assert.equal(listeners.size, 0);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it('Navigation API 미지원 환경에서도 local guard를 유지하고 unsupported 또는 uncancelable navigation은 통과시킨다', async () => {
    const listeners = new Set<(event: NavigationEventLike) => void>();
    const navigation = {
      addEventListener: (_type: string, listener: (event: NavigationEventLike) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: NavigationEventLike) => void) => {
        listeners.delete(listener);
      },
      traverseTo: () => ({ finished: Promise.resolve() }),
    };
    const previousWindow = globalThis.window;

    try {
      const localAction = mock.fn();
      const localGuard = mock.fn((action: GuardedNavigationAction) => {
        action();
        return true;
      });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {},
      });
      await act(async () => {
        renderer = create(
          createElement(
            NavigationGuardProvider,
            null,
            createElement(GuardRegistrar, { handler: localGuard }),
            createElement(LocalRequestProbe),
          ),
        );
      });
      assert.equal(localRequest?.(localAction), true);
      assert.equal(localGuard.mock.callCount(), 1);
      assert.equal(localAction.mock.callCount(), 1);
      await act(async () => renderer?.unmount());
      renderer = null;

      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { navigation },
      });
      const guard = mock.fn(() => true);
      await act(async () => {
        renderer = create(
          createElement(
            NavigationGuardProvider,
            null,
            createElement(GuardRegistrar, { handler: guard }),
          ),
        );
      });

      const unsupportedEvent: NavigationEventLike = {
        cancelable: true,
        destination: { key: 'unsupported-key', sameDocument: true },
        navigationType: 'push',
        preventDefault: mock.fn(),
      };
      const uncancelableEvent: NavigationEventLike = {
        cancelable: false,
        destination: { key: 'uncancelable-key', sameDocument: true },
        navigationType: 'traverse',
        preventDefault: mock.fn(),
      };
      listeners.forEach((listener) => listener(unsupportedEvent));
      listeners.forEach((listener) => listener(uncancelableEvent));

      assert.equal(guard.mock.callCount(), 0);
      assert.equal(unsupportedEvent.preventDefault.mock.callCount(), 0);
      assert.equal(uncancelableEvent.preventDefault.mock.callCount(), 0);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  });
});
