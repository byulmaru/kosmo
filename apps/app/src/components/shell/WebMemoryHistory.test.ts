import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { it } from 'node:test';

const require = createRequire(import.meta.url);
const buildDirectory = dirname(require.resolve('expo-router'));

type NavigationState = {
  index: number;
  key: string;
  routeNames: string[];
  routes: Array<{ key: string; name: string; state?: NavigationState }>;
  stale: false;
  type: 'stack';
};

type MemoryHistoryEntry = { id: string; path: string; state: NavigationState };

type MemoryHistory = {
  get: (index: number) => MemoryHistoryEntry | undefined;
  index: number;
  listen: (listener: () => void) => () => void;
  push: (entry: Pick<MemoryHistoryEntry, 'path' | 'state'>) => void;
  replace: (entry: Pick<MemoryHistoryEntry, 'path' | 'state'>) => void;
};

const { createMemoryHistory } = require(join(buildDirectory, 'fork/createMemoryHistory.js')) as {
  createMemoryHistory: () => MemoryHistory;
};

function createNavigationState(key: string, name: string): NavigationState {
  return {
    index: 0,
    key,
    routeNames: [name],
    routes: [{ key: `${key}-route`, name }],
    stale: false,
    type: 'stack',
  };
}

it('preserves route state through browser Back, Forward, and a new branch', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const browserEntries: Array<{ state: { id: string } | null }> = [{ state: null }];
  let browserIndex = 0;
  const browserLocation = { hash: '' };
  const browserWindow = Object.assign(new EventTarget(), {
    history: {
      get state() {
        return browserEntries[browserIndex]?.state ?? null;
      },
      pushState(state: { id: string }) {
        browserEntries.splice(browserIndex + 1);
        browserEntries.push({ state });
        browserIndex = browserEntries.length - 1;
      },
      replaceState(state: { id: string }) {
        browserEntries[browserIndex] = { state };
      },
    },
  });

  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: browserLocation });

  let unsubscribe: (() => void) | undefined;

  try {
    const memory = createMemoryHistory();
    const localState = createNavigationState('local-root', '(protected)');
    const postProtectedState = createNavigationState('post-protected', 'post/[postId]');
    const postState: NavigationState = {
      index: 0,
      key: 'post-root',
      routeNames: ['(protected)'],
      routes: [{ key: 'post-protected-route', name: '(protected)', state: postProtectedState }],
      stale: false,
      type: 'stack',
    };
    const replacementState = createNavigationState('replacement-root', 'search');

    memory.replace({ path: '/local', state: localState });
    memory.push({ path: '/post', state: postState });
    const postEntryId = memory.get(1)?.id;

    unsubscribe = memory.listen(() => {
      const entry = memory.get(memory.index);
      assert.ok(entry);
      memory.replace({ path: entry.path, state: entry.state });
    });

    browserIndex = 0;
    browserLocation.hash = '';
    browserWindow.dispatchEvent(new Event('popstate'));

    assert.equal(memory.index, 0);
    assert.equal(memory.get(0)?.path, '/local');
    assert.deepEqual(memory.get(0)?.state, localState);

    browserIndex = 1;
    browserWindow.dispatchEvent(new Event('popstate'));

    assert.equal(memory.index, 1);
    assert.equal(memory.get(1)?.path, '/post');
    assert.deepEqual(memory.get(1)?.state, postState);
    assert.equal(memory.get(1)?.id, postEntryId);
    assert.deepEqual(memory.get(1)?.state.routes[0]?.state, postProtectedState);

    browserIndex = 0;
    browserWindow.dispatchEvent(new Event('popstate'));
    memory.push({ path: '/search', state: replacementState });

    assert.equal(memory.index, 1);
    assert.equal(memory.get(1)?.path, '/search');
    assert.deepEqual(memory.get(1)?.state, replacementState);
    assert.equal(memory.get(2), undefined);
    assert.equal(browserEntries.length, 2);
  } finally {
    unsubscribe?.();
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation);
    } else {
      Reflect.deleteProperty(globalThis, 'location');
    }
  }
});
