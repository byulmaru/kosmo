import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { InfiniteListProps } from './InfiniteList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
