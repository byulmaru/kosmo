import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  PrimaryNavigationScrollProvider as PrimaryNavigationScrollProviderExport,
  PrimaryNavigationScrollReset as PrimaryNavigationScrollResetExport,
  usePrimaryNavigationScroll as usePrimaryNavigationScrollExport,
} from './PrimaryNavigationScrollContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const scrollTo = mock.fn();
let renderer: ReactTestRenderer | null = null;
let recordIntent: ((pathname: string) => void) | undefined;
let isHistoryEntryRestoration: (() => boolean) | undefined;
let historyRestorationObservedOnMount: boolean | undefined;
let currentScrollY = 0;
let nextAnimationFrame = 0;
const animationFrames = new Map<number, FrameRequestCallback>();
type WindowListener = { capture: boolean; listener: EventListener };
const eventListeners = new Map<string, Set<WindowListener>>();
const historyWindow = {
  scrollTo: (options: { top: number }) => {
    scrollTo(options);
    currentScrollY = options.top;
  },
  cancelAnimationFrame: (id: number) => {
    animationFrames.delete(id);
  },
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    const id = ++nextAnimationFrame;
    animationFrames.set(id, callback);
    return id;
  },
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | { capture?: boolean },
  ) => {
    const listeners = eventListeners.get(type) ?? new Set<WindowListener>();
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
    listeners.add({ capture, listener });
    eventListeners.set(type, listeners);
  },
  removeEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | { capture?: boolean },
  ) => {
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
    const listeners = eventListeners.get(type);
    for (const entry of listeners ?? []) {
      if (entry.listener === listener && entry.capture === capture) {
        listeners?.delete(entry);
      }
    }
  },
  history: { state: { id: 'entry-a' } },
  location: { href: 'https://example.test/home' },
  innerHeight: 100,
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: platform });

let PrimaryNavigationScrollProvider: typeof PrimaryNavigationScrollProviderExport;
let PrimaryNavigationScrollReset: typeof PrimaryNavigationScrollResetExport;
let usePrimaryNavigationScroll: typeof usePrimaryNavigationScrollExport;

before(async () => {
  ({ PrimaryNavigationScrollProvider, PrimaryNavigationScrollReset, usePrimaryNavigationScroll } =
    await import('./PrimaryNavigationScrollContext'));
  (globalThis as unknown as { window?: { scrollTo: typeof scrollTo } }).window = {
    scrollTo,
  };
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  recordIntent = undefined;
  isHistoryEntryRestoration = undefined;
  historyRestorationObservedOnMount = undefined;
  platform.OS = 'web';
  currentScrollY = 0;
  animationFrames.clear();
  eventListeners.clear();
  nextAnimationFrame = 0;
  scrollTo.mock.resetCalls();
  (globalThis as unknown as { window?: unknown }).window = { scrollTo };
  delete (globalThis as { document?: unknown }).document;
  mock.restoreAll();
});

function installHistoryWindow() {
  historyWindow.history.state = { id: 'entry-a' };
  historyWindow.location.href = 'https://example.test/home';
  Object.defineProperty(historyWindow, 'scrollY', {
    configurable: true,
    get: () => currentScrollY,
  });
  (globalThis as unknown as { window?: unknown }).window = historyWindow;
  (globalThis as unknown as { document?: unknown }).document = {
    documentElement: { scrollHeight: 1000 },
  };
}

function dispatchWindowEvent(type: string) {
  for (const capture of [true, false]) {
    for (const { capture: listenerCapture, listener } of eventListeners.get(type) ?? []) {
      if (listenerCapture === capture) {
        listener(new Event(type));
      }
    }
  }
}

async function flushAnimationFrames() {
  const callbacks = [...animationFrames.values()];
  animationFrames.clear();
  for (const callback of callbacks) {
    callback(0);
  }
  await act(async () => undefined);
}

function IntentProbe() {
  const navigationScroll = usePrimaryNavigationScroll();
  recordIntent = navigationScroll.record;
  isHistoryEntryRestoration = navigationScroll.isHistoryEntryRestoration;
  return null;
}

function HistoryRestorationProbe() {
  historyRestorationObservedOnMount = usePrimaryNavigationScroll().isHistoryEntryRestoration();
  return null;
}

function renderReset(pathname: string, includeHistoryRestorationProbe = false) {
  return createElement(
    PrimaryNavigationScrollProvider,
    null,
    createElement(IntentProbe),
    createElement(PrimaryNavigationScrollReset, { pathname }),
    includeHistoryRestorationProbe ? createElement(HistoryRestorationProbe) : null,
  );
}

describe('PrimaryNavigationScrollContext', () => {
  it('pathname commit에서 일치하는 최신 intent만 한 번 소비한다', async () => {
    await act(async () => {
      renderer = create(renderReset('/home'));
    });
    recordIntent?.('/search');
    recordIntent?.('/notifications');

    await act(async () => {
      renderer?.update(renderReset('/notifications'));
    });

    assert.equal(scrollTo.mock.callCount(), 1);
    assert.deepEqual(scrollTo.mock.calls[0].arguments[0], {
      behavior: 'auto',
      left: 0,
      top: 0,
    });

    await act(async () => {
      renderer?.update(renderReset('/notifications'));
    });
    assert.equal(scrollTo.mock.callCount(), 1);
  });

  it('일치하지 않는 pathname과 Native에서는 document scroll을 변경하지 않는다', async () => {
    await act(async () => {
      renderer = create(renderReset('/home'));
    });
    recordIntent?.('/search');

    await act(async () => {
      renderer?.update(renderReset('/notifications'));
    });
    assert.equal(scrollTo.mock.callCount(), 0);

    platform.OS = 'ios';
    recordIntent?.('/profile');
    await act(async () => {
      renderer?.update(renderReset('/profile'));
    });
    assert.equal(scrollTo.mock.callCount(), 0);
  });

  it('기록되지 않은 history key의 popstate는 browser restoration을 덮지 않는다', async () => {
    installHistoryWindow();
    await act(async () => {
      renderer = create(renderReset('/home'));
    });
    assert.equal(isHistoryEntryRestoration?.(), false);

    historyWindow.history.state = { id: 'entry-b' };
    historyWindow.location.href = 'https://example.test/notifications';
    dispatchWindowEvent('popstate');
    await flushAnimationFrames();

    assert.equal(scrollTo.mock.callCount(), 0);
  });

  it('POP key는 router 처리 전에 기록되고 replay 종료와 지연 mount 뒤에도 유지한다', async () => {
    installHistoryWindow();
    currentScrollY = 80;
    let routerObservedRestoration = false;
    historyWindow.addEventListener('popstate', () => {
      routerObservedRestoration = isHistoryEntryRestoration?.() ?? false;
    });
    await act(async () => {
      renderer = create(renderReset('/notifications'));
    });

    historyWindow.history.state = { id: 'entry-b' };
    historyWindow.location.href = 'https://example.test/notifications';
    currentScrollY = 240;
    dispatchWindowEvent('scroll');
    historyWindow.history.state = { id: 'entry-a' };
    historyWindow.location.href = 'https://example.test/home';
    currentScrollY = 0;
    dispatchWindowEvent('popstate');

    assert.equal(routerObservedRestoration, true);
    for (let index = 0; index < 10 && animationFrames.size; index += 1) {
      await flushAnimationFrames();
    }

    assert.equal(currentScrollY, 80);
    assert.equal(isHistoryEntryRestoration?.(), true);
    await act(async () => {
      renderer?.update(renderReset('/home', true));
    });
    assert.equal(historyRestorationObservedOnMount, true);
  });

  it('POP 취소 뒤에는 현재 key만 restoration으로 보고 Native에서는 false다', async () => {
    installHistoryWindow();
    currentScrollY = 80;
    await act(async () => {
      renderer = create(renderReset('/home'));
    });

    historyWindow.history.state = { id: 'entry-b' };
    historyWindow.location.href = 'https://example.test/notifications';
    currentScrollY = 240;
    dispatchWindowEvent('scroll');
    historyWindow.history.state = { id: 'entry-a' };
    historyWindow.location.href = 'https://example.test/home';
    currentScrollY = 0;
    dispatchWindowEvent('popstate');
    dispatchWindowEvent('wheel');

    assert.equal(animationFrames.size, 0);
    assert.equal(isHistoryEntryRestoration?.(), true);

    historyWindow.history.state = { id: 'entry-c' };
    historyWindow.location.href = 'https://example.test/unrecorded';
    dispatchWindowEvent('popstate');
    assert.equal(isHistoryEntryRestoration?.(), true);

    historyWindow.history.state = { id: 'entry-d' };
    assert.equal(isHistoryEntryRestoration?.(), false);
    historyWindow.history.state = { id: 'entry-a' };
    dispatchWindowEvent('popstate');
    historyWindow.location.href = 'https://example.test/canonical-home';
    assert.equal(isHistoryEntryRestoration?.(), true);

    platform.OS = 'ios';
    assert.equal(isHistoryEntryRestoration?.(), false);
  });

  it('history replay는 새 primary forward intent가 기록되면 즉시 취소한다', async () => {
    installHistoryWindow();
    currentScrollY = 120;
    await act(async () => {
      renderer = create(renderReset('/home'));
    });

    historyWindow.history.state = { id: 'entry-b' };
    historyWindow.location.href = 'https://example.test/notifications';
    dispatchWindowEvent('scroll');
    historyWindow.history.state = { id: 'entry-a' };
    historyWindow.location.href = 'https://example.test/home';
    dispatchWindowEvent('popstate');
    recordIntent?.('/search');
    await flushAnimationFrames();

    assert.equal(scrollTo.mock.callCount(), 0);
  });

  it('history replay는 목표 offset과 layout 안정 뒤 짧게 종료한다', async () => {
    installHistoryWindow();
    currentScrollY = 80;
    await act(async () => {
      renderer = create(renderReset('/home'));
    });

    historyWindow.history.state = { id: 'entry-b' };
    historyWindow.location.href = 'https://example.test/notifications';
    currentScrollY = 240;
    dispatchWindowEvent('scroll');
    historyWindow.history.state = { id: 'entry-a' };
    historyWindow.location.href = 'https://example.test/home';
    currentScrollY = 0;
    dispatchWindowEvent('popstate');

    for (let index = 0; index < 10 && animationFrames.size; index += 1) {
      await flushAnimationFrames();
    }

    assert.equal(currentScrollY, 80);
    assert.ok(scrollTo.mock.callCount() <= 4);
    assert.equal(animationFrames.size, 0);
  });
});
