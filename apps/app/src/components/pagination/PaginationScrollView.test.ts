import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type NativeScrollProps = {
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;
  onScroll: (event: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => void;
  scrollEventThrottle: 16;
};

let contentHeight = 0;
let layoutHeight = 0;
let scrollOffset = 0;
const handlers: NativeScrollProps = {
  onContentSizeChange: (_width, height) => {
    contentHeight = height;
  },
  onLayout: (event) => {
    layoutHeight = event.nativeEvent.layout.height;
  },
  onScroll: (event) => {
    contentHeight = event.nativeEvent.contentSize.height;
    layoutHeight = event.nativeEvent.layoutMeasurement.height;
    scrollOffset = event.nativeEvent.contentOffset.y;
  },
  scrollEventThrottle: 16,
};
let renderer: ReactTestRenderer | null = null;

mock.module('react-native', {
  exports: {
    Platform: { OS: 'ios' },
    ScrollView: 'ScrollView',
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PaginationScrollView: ComponentType<PropsWithChildren<{ paginationOwnerKey: string }>>;
let usePaginationScrollRegistration: (props: NativeScrollProps) => void;

before(async () => {
  const module = await import('./PaginationScrollView');
  PaginationScrollView = module.PaginationScrollView as ComponentType<
    PropsWithChildren<{ paginationOwnerKey: string }>
  >;
  usePaginationScrollRegistration = module.usePaginationScrollRegistration;
});

beforeEach(() => {
  contentHeight = 0;
  layoutHeight = 0;
  scrollOffset = 0;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

function RegistrationProbe() {
  usePaginationScrollRegistration(handlers);
  return createElement('Content');
}

function renderOwner(registered: boolean, paginationOwnerKey = 'owner-a') {
  return createElement(
    PaginationScrollView,
    { paginationOwnerKey },
    registered ? createElement(RegistrationProbe) : createElement('Content'),
  );
}

describe('PaginationScrollView', () => {
  it('registration 전 초기 metric을 저장해 자식 handler에 전달하고 unmount에서 해제한다', async () => {
    await act(async () => {
      renderer = create(renderOwner(false));
    });
    assert.ok(renderer);

    let scrollViews = renderer.root.findAll((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(scrollViews.length, 1);
    assert.equal(typeof scrollViews[0]?.props.onContentSizeChange, 'function');
    assert.equal(typeof scrollViews[0]?.props.onLayout, 'function');
    assert.equal(typeof scrollViews[0]?.props.onScroll, 'function');
    assert.equal(scrollViews[0]?.props.scrollEventThrottle, 16);
    scrollViews[0]?.props.onContentSizeChange(320, 480);
    scrollViews[0]?.props.onLayout({ nativeEvent: { layout: { height: 240 } } });
    scrollViews[0]?.props.onScroll({
      nativeEvent: {
        contentOffset: { y: 16 },
        contentSize: { height: 480 },
        layoutMeasurement: { height: 240 },
      },
    });

    assert.equal(contentHeight, 0);
    assert.equal(layoutHeight, 0);
    assert.equal(scrollOffset, 0);

    await act(async () => {
      renderer?.update(renderOwner(true));
    });

    assert.equal(contentHeight, 480);
    assert.equal(layoutHeight, 240);
    assert.equal(scrollOffset, 16);

    await act(async () => {
      renderer?.update(renderOwner(false));
    });

    scrollViews = renderer.root.findAll((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(scrollViews.length, 1);
    scrollViews[0]?.props.onContentSizeChange(320, 960);
    assert.equal(contentHeight, 480);

    await act(async () => {
      renderer?.update(renderOwner(true));
    });
    assert.equal(contentHeight, 960);
  });

  it('owner가 바뀌면 이전 metric을 새 registration에 재생하지 않는다', async () => {
    await act(async () => {
      renderer = create(renderOwner(false, 'owner-a'));
    });
    assert.ok(renderer);

    let scrollViews = renderer.root.findAll((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(scrollViews.length, 1);
    let scrollView = scrollViews[0];
    assert.ok(scrollView);
    scrollView.props.onScroll({
      nativeEvent: {
        contentOffset: { y: 240 },
        contentSize: { height: 480 },
        layoutMeasurement: { height: 240 },
      },
    });

    await act(async () => {
      renderer?.update(renderOwner(false, 'owner-b'));
      renderer?.update(renderOwner(true, 'owner-b'));
    });

    assert.equal(contentHeight, 0);
    assert.equal(layoutHeight, 0);
    assert.equal(scrollOffset, 0);

    await act(async () => {
      renderer?.update(renderOwner(false, 'owner-b'));
    });
    scrollViews = renderer.root.findAll((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(scrollViews.length, 1);
    scrollView = scrollViews[0];
    assert.ok(scrollView);
    scrollView.props.onScroll({
      nativeEvent: {
        contentOffset: { y: 24 },
        contentSize: { height: 960 },
        layoutMeasurement: { height: 320 },
      },
    });

    await act(async () => {
      renderer?.update(renderOwner(true, 'owner-b'));
    });

    assert.equal(contentHeight, 960);
    assert.equal(layoutHeight, 320);
    assert.equal(scrollOffset, 24);
  });
});
