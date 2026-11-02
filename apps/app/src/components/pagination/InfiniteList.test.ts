import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { InfiniteListProps } from './InfiniteList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const windowFixture = {
  addEventListener: () => undefined,
  cancelAnimationFrame: () => undefined,
  innerHeight: 800,
  removeEventListener: () => undefined,
  requestAnimationFrame: () => 1,
  scrollY: 0,
};
const documentFixture = { documentElement: { scrollHeight: 1200 } };
const restoreGlobal = (name: 'window' | 'document', descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete (globalThis as Record<string, unknown>)[name];
  }
};

type Item = Readonly<{ id: string; label: string }>;
type TestProps = Omit<InfiniteListProps<Item>, 'loadNext'>;

const platform = { OS: 'ios' };
const loadRequests: Array<{
  count: number;
  onComplete: (error: Error | null) => void;
}> = [];
let renderer: ReactTestRenderer | null = null;
let InfiniteList: ComponentType<InfiniteListProps<Item>>;
let PaginationScrollView: ComponentType<{
  children?: ReactNode;
}>;
let latestLoadError = false;
let latestRetry: (() => void) | null = null;

mock.module('react-native', {
  exports: {
    FlatList: 'FlatList',
    Platform: platform,
    ScrollView: 'ScrollView',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ PaginationScrollView } = await import('./PaginationScrollView'));
  ({ InfiniteList } = await import('./InfiniteList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  loadRequests.length = 0;
  latestLoadError = false;
  latestRetry = null;
  platform.OS = 'ios';
  restoreGlobal('window', originalWindowDescriptor);
  restoreGlobal('document', originalDocumentDescriptor);
});

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

async function update(nextProps: InfiniteListProps<Item>) {
  assert.ok(renderer);
  await act(async () => renderer?.update(createElement(InfiniteList, nextProps)));
}

describe('InfiniteList', () => {
  it('native FlatList owns a feed header ahead of its rows', async () => {
    const header = createElement('FeedHeader');

    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ header })));
    });

    assert.equal(flatList().props.ListHeaderComponent, header);
  });

  it('web document flow places the feed header before empty and row content', async () => {
    platform.OS = 'web';
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
    const header = createElement('FeedHeader');
    const empty = createElement('Empty');

    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ data: [], empty, header })));
    });

    const feedContent = renderer?.root.findAll((node) => (node.type as unknown) === 'View')[0];
    const headerChild = feedContent?.children[0];
    const emptyChild = feedContent?.children[1];
    assert.equal(
      typeof headerChild === 'object' && headerChild !== null ? headerChild.type : headerChild,
      'FeedHeader',
    );
    assert.equal(
      typeof emptyChild === 'object' && emptyChild !== null ? emptyChild.type : emptyChild,
      'Empty',
    );
  });

  it('native FlatList가 footer와 endReached pagination을 소유한다', async () => {
    const empty = createElement('Empty');
    const footer = createElement('LoadingFooter');

    await act(async () => {
      renderer = create(
        createElement(InfiniteList, {
          ...props({ empty, footer: null }),
        }),
      );
    });

    let list = flatList();
    assert.equal(list.props.ListEmptyComponent, empty);
    assert.equal(list.props.ListFooterComponent, null);
    assert.equal(list.props.onEndReachedThreshold, 1);
    assert.equal(list.props.keyExtractor({ id: 'b' }, 0), 'b');

    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 1);
    assert.equal(loadRequests[0]?.count, 20);

    await update(props({ empty, footer, isLoadingNext: true }));
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
        footer: null,
      }),
    );
    list = flatList();
    assert.equal(list.props.ListFooterComponent, null);

    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 2, 'page 완료 뒤 다음 endReached를 처리한다');
  });

  it('native endReached는 실패 뒤 자동 재요청하지 않고 onLoadErrorChange retry만 허용한다', async () => {
    const onLoadErrorChange = (loadError: boolean, onRetry: () => void) => {
      latestLoadError = loadError;
      latestRetry = onRetry;
    };

    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ onLoadErrorChange })));
    });
    await act(async () => flatList().props.onEndReached());
    await act(async () => loadRequests[0]?.onComplete(new Error('failed')));

    await update(props({ onLoadErrorChange }));
    const list = flatList();
    assert.equal(latestLoadError, true);
    await act(async () => list.props.onEndReached());
    assert.equal(loadRequests.length, 1);
    assert.ok(latestRetry);
    await act(async () => latestRetry?.());
    assert.equal(loadRequests.length, 2);
  });

  it('native FlatList가 pull-to-refresh callback과 진행 상태를 전달한다', async () => {
    const onRefresh = mock.fn();

    await act(async () => {
      renderer = create(createElement(InfiniteList, props({ onRefresh, refreshing: true })));
    });

    let list = flatList();
    assert.equal(list.props.onRefresh, onRefresh);
    assert.equal(list.props.refreshing, true);

    await act(async () => list.props.onRefresh());
    assert.equal(onRefresh.mock.callCount(), 1);

    await update(props({ onRefresh, refreshing: false }));
    list = flatList();
    assert.equal(list.props.refreshing, false);
  });

  it('PaginationScrollView 안에서는 View body가 outer metrics pagination을 등록한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(PaginationScrollView, null, createElement(InfiniteList, props())),
      );
    });

    assert.equal(renderer?.root.findAll((node) => (node.type as unknown) === 'FlatList').length, 0);
    const scrollView = renderer?.root.findAll((node) => (node.type as unknown) === 'ScrollView')[0];
    assert.ok(scrollView);

    await act(async () => {
      scrollView.props.onContentSizeChange(320, 1000);
      scrollView.props.onLayout({ nativeEvent: { layout: { height: 100 } } });
      scrollView.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 920 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 100 },
        },
      });
    });

    assert.equal(loadRequests.length, 1);
  });
});
