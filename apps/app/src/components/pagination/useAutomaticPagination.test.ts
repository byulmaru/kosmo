import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { createNativeScrollHandlers } from './nativeScrollPagination';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookOptions = {
  hasNext: boolean;
  isLoadingNext: boolean;
  itemCount: number;
  loadNext: (count: number, options: { onComplete: (error: Error | null) => void }) => void;
  pageSize: number;
  webScrollTarget?: 'container' | 'document';
};

type HookResult = {
  loadError: boolean;
  loadNextPage: () => void;
  nativeScrollProps: ReturnType<typeof createNativeScrollHandlers>;
};

const platform = { OS: 'web' };
const listeners = new Map<string, Set<EventListener>>();
const animationFrames = new Map<number, FrameRequestCallback>();
const loadRequests: Array<{
  count: number;
  onComplete: (error: Error | null) => void;
}> = [];
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
let nextAnimationFrame = 0;
let renderer: ReactTestRenderer | null = null;
let current: HookResult | undefined;

const windowFixture = {
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    const id = ++nextAnimationFrame;
    animationFrames.set(id, callback);
    return id;
  },
  cancelAnimationFrame: (id: number) => {
    animationFrames.delete(id);
  },
  addEventListener: (type: string, listener: EventListener) => {
    const typeListeners = listeners.get(type) ?? new Set<EventListener>();
    typeListeners.add(listener);
    listeners.set(type, typeListeners);
  },
  removeEventListener: (type: string, listener: EventListener) => {
    listeners.get(type)?.delete(listener);
  },
  scrollY: 0,
  innerHeight: 800,
};
const documentFixture = { documentElement: { scrollHeight: 1200 } };

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: platform });

let useAutomaticPagination: (options: HookOptions) => HookResult;

before(async () => {
  ({ useAutomaticPagination } = await import('./useAutomaticPagination'));
});

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: windowFixture,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: documentFixture,
  });
});

const restoreGlobal = (name: 'window' | 'document', descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete (globalThis as Record<string, unknown>)[name];
  }
};

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  await new Promise((resolve) => setTimeout(resolve, 0));
  current = undefined;
  platform.OS = 'web';
  windowFixture.scrollY = 0;
  windowFixture.innerHeight = 800;
  documentFixture.documentElement.scrollHeight = 1200;
  listeners.clear();
  animationFrames.clear();
  loadRequests.length = 0;
  nextAnimationFrame = 0;
  restoreGlobal('window', originalWindowDescriptor);
  restoreGlobal('document', originalDocumentDescriptor);
});

function HookProbe(options: HookOptions) {
  current = useAutomaticPagination(options);
  return null;
}

const loadNext = (count: number, options: { onComplete: (error: Error | null) => void }) => {
  loadRequests.push({ count, onComplete: options.onComplete });
};

function options(overrides: Partial<Omit<HookOptions, 'loadNext' | 'pageSize'>> = {}): HookOptions {
  return {
    hasNext: true,
    isLoadingNext: false,
    itemCount: 20,
    loadNext,
    pageSize: 20,
    ...overrides,
  };
}

async function renderHook(nextOptions: HookOptions) {
  await act(async () => {
    renderer = create(createElement(HookProbe, nextOptions));
  });
  assert.ok(current);
}

async function updateHook(nextOptions: HookOptions) {
  assert.ok(renderer);
  await act(async () => {
    renderer?.update(createElement(HookProbe, nextOptions));
  });
  assert.ok(current);
}

function currentResult() {
  assert.ok(current);
  return current;
}

async function runAnimationFrame() {
  const callbacks = [...animationFrames.values()];
  animationFrames.clear();
  await act(async () => {
    callbacks.forEach((callback) => callback(0));
  });
}

async function dispatchWindowEvent(type: string) {
  const typeListeners = [...(listeners.get(type) ?? [])];
  await act(async () => {
    typeListeners.forEach((listener) => listener(new Event(type)));
  });
}

async function completeRequest(index: number, error: Error | null) {
  const request = loadRequests[index];
  assert.ok(request);
  await act(async () => {
    request.onComplete(error);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useAutomaticPagination', () => {
  it('Web near-end에서 한 번 요청하고 짧은 성공 page 뒤 다시 측정한다', async () => {
    await renderHook(options());
    await runAnimationFrame();
    assert.equal(loadRequests.length, 1);

    await dispatchWindowEvent('scroll');
    await dispatchWindowEvent('resize');
    assert.equal(loadRequests.length, 1, 'in-flight request는 중복 실행하지 않는다');

    await updateHook(options({ isLoadingNext: true, itemCount: 20 }));
    await completeRequest(0, null);
    await updateHook(options({ isLoadingNext: false, itemCount: 40 }));
    await runAnimationFrame();
    assert.equal(loadRequests.length, 2, '짧은 성공 page 뒤 near-end를 다시 측정한다');

    await updateHook(options({ isLoadingNext: true, itemCount: 40 }));
    await completeRequest(1, null);
    await updateHook(options({ isLoadingNext: false, itemCount: 60 }));
    await runAnimationFrame();
    assert.equal(loadRequests.length, 3, '연속된 두 번째 짧은 page도 다시 측정한다');

    await updateHook(options({ isLoadingNext: true, itemCount: 60 }));
    await completeRequest(2, null);
    await updateHook(options({ hasNext: false, isLoadingNext: false, itemCount: 65 }));
    await runAnimationFrame();
    assert.equal(loadRequests.length, 3, '마지막 page에서는 추가 요청하지 않는다');
  });

  it('Web itemCount RAF가 먼저 실행돼도 성공 page 뒤 다시 측정한다', async () => {
    await renderHook(options());
    await runAnimationFrame();
    assert.equal(loadRequests.length, 1);

    await updateHook(options({ isLoadingNext: true, itemCount: 20 }));
    const request = loadRequests[0];
    assert.ok(request);
    const scheduledTimers: Array<() => void> = [];
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: () => void) => {
      scheduledTimers.push(callback);
      return 1;
    }) as typeof setTimeout;

    try {
      await act(async () => request.onComplete(null));
      await updateHook(options({ isLoadingNext: false, itemCount: 40 }));
      await runAnimationFrame();
      assert.equal(loadRequests.length, 1, 'guard 해제 전 itemCount RAF는 요청하지 않는다');

      const completeSuccess = scheduledTimers.shift();
      assert.ok(completeSuccess);
      await act(async () => completeSuccess());
      await runAnimationFrame();
      assert.equal(loadRequests.length, 2, 'guard 해제 뒤 성공 lifecycle이 다시 측정한다');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('Web page 실패는 자동 재시도를 막고 수동 재시도만 허용한다', async () => {
    await renderHook(options());
    await runAnimationFrame();
    assert.equal(loadRequests.length, 1);

    await completeRequest(0, new Error('next page failed'));
    assert.equal(currentResult().loadError, true);

    await dispatchWindowEvent('scroll');
    assert.equal(loadRequests.length, 1, '실패 뒤 자동 요청을 반복하지 않는다');

    await act(async () => currentResult().loadNextPage());
    assert.equal(loadRequests.length, 2, '수동 재시도는 같은 page를 다시 요청한다');
    assert.equal(currentResult().loadError, false);
  });

  it('Web container는 document listener 없이 저장된 metric으로 다음 page를 측정한다', async () => {
    await renderHook(options({ webScrollTarget: 'container' }));
    assert.equal(listeners.get('scroll')?.size ?? 0, 0);
    assert.equal(listeners.get('resize')?.size ?? 0, 0);

    await act(async () => {
      currentResult().nativeScrollProps.onLayout({
        nativeEvent: { layout: { height: 800 } },
      });
      currentResult().nativeScrollProps.onContentSizeChange(0, 1200);
    });
    assert.equal(loadRequests.length, 1);

    await updateHook(options({ isLoadingNext: true, webScrollTarget: 'container' }));
    await completeRequest(0, null);
    await updateHook(
      options({ isLoadingNext: false, itemCount: 40, webScrollTarget: 'container' }),
    );
    assert.equal(loadRequests.length, 2);
  });

  it('Native metric으로 요청하고 Relay loading 뒤 저장된 metric을 다시 측정한다', async () => {
    platform.OS = 'ios';
    await renderHook(options());

    await act(async () => {
      currentResult().nativeScrollProps.onLayout({
        nativeEvent: { layout: { height: 800 } },
      });
      currentResult().nativeScrollProps.onContentSizeChange(0, 1200);
    });
    assert.equal(loadRequests.length, 1);

    await act(async () => {
      currentResult().nativeScrollProps.onScroll({
        nativeEvent: {
          contentOffset: { y: 400 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 800 },
        },
      });
    });
    assert.equal(loadRequests.length, 1, 'Native in-flight guard를 유지한다');

    await updateHook(options({ isLoadingNext: true, itemCount: 20 }));
    await completeRequest(0, null);
    assert.equal(loadRequests.length, 1, 'Relay loading 중에는 성공 재측정을 보류한다');

    await updateHook(options({ isLoadingNext: false, itemCount: 40 }));
    assert.equal(loadRequests.length, 2, '성공 뒤 저장된 Native metric을 다시 측정한다');
  });

  it('Web listener와 pending RAF를 unmount 때 정리한다', async () => {
    await renderHook(options());
    assert.equal(listeners.get('scroll')?.size, 1);
    assert.equal(listeners.get('resize')?.size, 1);
    assert.equal(animationFrames.size, 1);

    const requestsBeforeUnmount = loadRequests.length;
    await act(async () => renderer?.unmount());
    renderer = null;
    assert.equal(listeners.get('scroll')?.size ?? 0, 0);
    assert.equal(listeners.get('resize')?.size ?? 0, 0);
    assert.equal(animationFrames.size, 0);

    await dispatchWindowEvent('scroll');
    assert.equal(loadRequests.length, requestsBeforeUnmount);
  });
});
