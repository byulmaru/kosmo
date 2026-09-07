import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { InfiniteListProps } from './InfiniteList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Item = Readonly<{ id: string; label: string }>;
type TestProps = Omit<InfiniteListProps<Item>, 'loadNext'>;

const platform = { OS: 'ios' };
const animationFrames = new Map<number, FrameRequestCallback>();
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const loadRequests: Array<{
  count: number;
  onComplete: (error: Error | null) => void;
}> = [];
const documentFixture = { documentElement: { scrollHeight: 1200 } };
const windowFixture = {
  addEventListener: () => undefined,
  cancelAnimationFrame: (id: number) => animationFrames.delete(id),
  innerHeight: 800,
  removeEventListener: () => undefined,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    const id = animationFrames.size + 1;
    animationFrames.set(id, callback);
    return id;
  },
  scrollY: 0,
};
let renderer: ReactTestRenderer | null = null;
let InfiniteList: ComponentType<InfiniteListProps<Item>>;

mock.module('react-native', {
  exports: {
    FlatList: 'FlatList',
    Platform: platform,
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ InfiniteList } = await import('./InfiniteList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  loadRequests.length = 0;
  animationFrames.clear();
  platform.OS = 'ios';
});

const installWebFixture = () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowFixture,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentFixture,
    writable: true,
  });
};

const restoreGlobal = (name: 'document' | 'window', descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete (globalThis as Record<string, unknown>)[name];
  }
};

const loadNext = (count: number, options: { onComplete: (error: Error | null) => void }) => {
  loadRequests.push({ count, onComplete: options.onComplete });
};

function props(overrides: Partial<TestProps> = {}): InfiniteListProps<Item> {
  return {
    data: [{ id: 'a', label: 'A' }],
    hasNext: true,
    isLoadingNext: false,
    keyExtractor: (item) => item.id,
    pageSize: 20,
    renderItem: ({ item }) => createElement('Row', { id: item.id }, item.label),
    ...overrides,
    loadNext,
  };
}

function flatList() {
  assert.ok(renderer);
  const list = renderer.root.findAll((node) => (node.type as unknown) === 'FlatList')[0];
  assert.ok(list);
  return list;
}

function requireRenderer() {
  assert.ok(renderer);
  return renderer;
}

async function update(nextProps: InfiniteListProps<Item>) {
  assert.ok(renderer);
  await act(async () => renderer?.update(createElement(InfiniteList, nextProps)));
}

describe('InfiniteList', () => {
  it('native FlatList가 header, footer와 endReached pagination을 소유한다', async () => {
    const header = createElement('Header');
    const empty = createElement('Empty');
    const renderFooter = ({ isLoadingNext }: { isLoadingNext: boolean }) =>
      isLoadingNext ? createElement('LoadingFooter') : null;

    await act(async () => {
      renderer = create(
        createElement(InfiniteList, {
          ...props({ empty, header, renderFooter }),
        }),
      );
    });

    let list = flatList();
    assert.equal(list.props.ListHeaderComponent, header);
    assert.equal(list.props.ListEmptyComponent, empty);
    assert.equal(list.props.ListFooterComponent, null);
    assert.equal(list.props.onEndReachedThreshold, 1);
    assert.equal(list.props.keyExtractor({ id: 'b' }, 0), 'b');

    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 1);
    assert.equal(loadRequests[0]?.count, 20);

    await update(props({ empty, header, isLoadingNext: true, renderFooter }));
    list = flatList();
    assert.equal((list.props.ListFooterComponent as ReactTestInstance).type, 'LoadingFooter');

    await act(async () => loadRequests[0]?.onComplete(null));
    await update(
      props({
        data: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        empty,
        header,
        renderFooter,
      }),
    );
    list = flatList();
    assert.equal(list.props.ListFooterComponent, null);

    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 2, 'page 완료 뒤 다음 endReached를 처리한다');
  });

  it('native endReached는 실패 뒤 자동 재요청하지 않고 footer retry만 노출한다', async () => {
    const renderFooter = ({ loadError, onRetry }: { loadError: boolean; onRetry: () => void }) =>
      loadError ? createElement('RetryFooter', { onRetry }) : null;

    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ renderFooter })));
    });
    await act(async () => flatList().props.onEndReached());
    await act(async () => loadRequests[0]?.onComplete(new Error('failed')));

    await update(props({ renderFooter }));
    const list = flatList();
    const retryFooter = list.props.ListFooterComponent as ReactTestInstance;
    assert.equal(retryFooter.type, 'RetryFooter');
    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 1);
    await act(async () => retryFooter.props.onRetry());
    assert.equal(loadRequests.length, 2);
  });

  it('native 빈 목록의 초기 endReached 요청은 실패 뒤 수동 retry만 허용한다', async () => {
    const renderFooter = ({ loadError, onRetry }: { loadError: boolean; onRetry: () => void }) =>
      loadError ? createElement('RetryFooter', { onRetry }) : null;

    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ data: [], renderFooter })));
    });
    await act(async () => flatList().props.onEndReached());
    assert.equal(loadRequests.length, 1);

    await update(props({ data: [], isLoadingNext: true, renderFooter }));
    await act(async () => loadRequests[0]?.onComplete(new Error('empty failed')));
    await update(props({ data: [], renderFooter }));
    const list = flatList();
    assert.equal((list.props.ListFooterComponent as ReactTestInstance).type, 'RetryFooter');
    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 1);
    await act(async () => (list.props.ListFooterComponent as ReactTestInstance).props.onRetry());
    assert.equal(loadRequests.length, 2);
  });

  it('native manual 목록은 endReached를 연결하지 않는다', async () => {
    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ paginationMode: 'manual' })));
    });

    assert.equal(flatList().props.onEndReached, undefined);
    assert.equal(loadRequests.length, 0);
  });

  it('Web manual 목록은 같은 document 끝 geometry에서도 자동 pagination을 실행하지 않는다', async () => {
    platform.OS = 'web';
    installWebFixture();

    try {
      await act(async () => {
        renderer = create(createElement(InfiniteList, props({ paginationMode: 'automatic' })));
      });
      const automaticFrames = [...animationFrames.values()];
      animationFrames.clear();
      await act(async () => automaticFrames.forEach((callback) => callback(0)));
      assert.equal(loadRequests.length, 1, '자동 목록은 document 끝에서 요청한다');

      await act(async () => renderer?.unmount());
      renderer = null;
      loadRequests.length = 0;

      await act(async () => {
        renderer = create(createElement(InfiniteList, props({ paginationMode: 'manual' })));
      });
      const manualFrames = [...animationFrames.values()];
      animationFrames.clear();
      await act(async () => manualFrames.forEach((callback) => callback(0)));
      const manualRenderer = requireRenderer();

      assert.equal(
        manualRenderer.root.findAll((node) => (node.type as unknown) === 'FlatList').length,
        0,
      );
      assert.equal(loadRequests.length, 0);
    } finally {
      restoreGlobal('window', originalWindowDescriptor);
      restoreGlobal('document', originalDocumentDescriptor);
    }
  });
});
