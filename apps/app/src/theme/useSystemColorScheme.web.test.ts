import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as SystemColorSchemeModule from './useSystemColorScheme.web';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let module: typeof SystemColorSchemeModule;
let renderer: ReactTestRenderer | undefined;
let matches = false;
const listeners = new Set<(event: MediaQueryListEvent) => void>();
const originalWindow = globalThis.window;

before(async () => {
  module = await import('./useSystemColorScheme.web');
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  matches = false;
  listeners.clear();
  if (originalWindow === undefined) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  } else {
    globalThis.window = originalWindow;
  }
});

describe('useSystemColorScheme.web', () => {
  it('follows MediaQueryList change events and removes its listener', async () => {
    const query = {
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    } as unknown as MediaQueryList;
    globalThis.window = {
      matchMedia: () => query,
    } as unknown as Window & typeof globalThis;

    let scheme = '';
    function Probe() {
      scheme = module.useSystemColorScheme();
      return null;
    }

    await act(async () => {
      renderer = create(createElement(Probe));
    });
    assert.equal(scheme, 'light');
    assert.equal(listeners.size, 1);

    matches = true;
    await act(async () => {
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    });
    assert.equal(scheme, 'dark');

    await act(async () => renderer?.unmount());
    renderer = undefined;
    assert.equal(listeners.size, 0);
  });
});
