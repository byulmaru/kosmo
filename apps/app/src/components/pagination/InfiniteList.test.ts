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
  paginationOwnerKey: string;
}>;

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

  it('PaginationScrollView 안에서는 View body가 outer metrics pagination을 등록한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(
          PaginationScrollView,
          { paginationOwnerKey: 'profile' },
          createElement(InfiniteList, props()),
        ),
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
