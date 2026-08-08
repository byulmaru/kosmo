import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, Fragment, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostDetailThread as PostDetailThreadComponent } from './PostDetailThread';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | null = null;
let documentScrollListener: (() => void) | null = null;
let loadNextCalls = 0;
let loadNextCompletions: Array<(error: Error | null) => void> = [];
let loadNextCallsByKey: Record<string, number> = {};
let loadNextCompletionsByKey: Record<string, Array<(error: Error | null) => void>> = {};
const platform = { OS: 'web' };
const documentElement = { scrollHeight: 2401 };

Object.assign(globalThis, {
  cancelAnimationFrame: () => undefined,
  document: { documentElement },
  innerHeight: 800,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
  scrollY: 800,
  window: globalThis,
});

globalThis.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
  if (type === 'scroll') {
    documentScrollListener = listener as () => void;
  }
}) as typeof globalThis.addEventListener;
globalThis.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
  if (type === 'scroll' && documentScrollListener === listener) {
    documentScrollListener = null;
  }
}) as typeof globalThis.removeEventListener;

mock.module('react-native', {
  exports: {
    Platform: platform,
    ScrollView: 'ScrollView',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => ({ width: 1200 }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    usePaginationFragment: (_fragment: unknown, key: { testPaginationKey?: string }) => {
      const paginationKey = key.testPaginationKey ?? 'default';
      const [isLoadingNext, setIsLoadingNext] = useState(false);
      return {
        data: {
          detail: { id: 'current-detail' },
          id: 'post-current',
          replyAncestors: [{ id: 'post-ancestor', listItem: { id: 'ancestor-list-item' } }],
          replyDescendants: {
            edges: [
              {
                node: {
                  id: 'post-descendant',
                  listItem: { id: 'descendant-list-item' },
                  replyParent: { id: 'post-current' },
                },
              },
            ],
          },
        },
        hasNext: true,
        isLoadingNext,
        loadNext: (_count: number, options: { onComplete: (error: Error | null) => void }) => {
          loadNextCalls += 1;
          setIsLoadingNext(true);
          const complete = (error: Error | null) => {
            setIsLoadingNext(false);
            options.onComplete(error);
          };
          loadNextCompletions.push(complete);
          loadNextCallsByKey[paginationKey] = (loadNextCallsByKey[paginationKey] ?? 0) + 1;
          (loadNextCompletionsByKey[paginationKey] ??= []).push(complete);
        },
      };
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/post/PostActionAuthentication', {
  exports: { PostActionAuthenticationProvider: ({ children }: PropsWithChildren) => children },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/post/PostLayout', {
  exports: {
    PostLayout: (props: Record<string, unknown>) =>
      createElement('PostLayout', { ...props, testID: 'thread-current-post' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/post/PostListItem', {
  exports: {
    PostListItem: (props: Record<string, unknown>) =>
      createElement('PostListItem', { ...props, testID: 'thread-list-post' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/post/PostMediaViewerHost', {
  exports: { PostMediaViewerHostProvider: ({ children }: PropsWithChildren) => children },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/post/PostReplyCoordinator', {
  exports: { PostReplyCoordinatorProvider: ({ children }: PropsWithChildren) => children },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/shell/ShellChromeContext', {
  exports: { useShellChrome: () => null },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/ui/Button', {
  exports: {
    Button: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) =>
      createElement('Button', props, children),
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/ThemeProvider', {
  exports: { useTheme: () => ({ border: '#cccccc', card: '#ffffff', divider: '#dddddd' }) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/theme/tokens', {
  exports: {
    radii: { full: 9999 },
    spacing: { lg: 24, md: 16, sm: 12, xs: 8, xxl: 32, xxxl: 48 },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let PostDetailThread: typeof PostDetailThreadComponent;

before(async () => {
  ({ PostDetailThread } = await import('./PostDetailThread'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  documentElement.scrollHeight = 2401;
  documentScrollListener = null;
  loadNextCalls = 0;
  loadNextCompletions = [];
  loadNextCallsByKey = {};
  loadNextCompletionsByKey = {};
});

describe('PostDetailThread Viewer presentation', () => {
  it('ancestors·현재 Post·descendants를 유지하고 현재 Post Media만 숨긴다', async () => {
    await render('viewer');

    const current = renderer!.root.findByProps({ testID: 'thread-current-post' });
    const surrounding = renderer!.root.findAllByProps({ testID: 'thread-list-post' });

    assert.equal(current.props.contentWarningPresentation, 'revealed');
    assert.equal(current.props.mediaPresentation, 'hidden');
    assert.equal('viewerWideDetail' in current.props, false);
    assert.equal(surrounding.length, 2);
    assert.ok(renderer!.root.findByProps({ testID: 'post-media-viewer-thread-scroll' }));
  });

  it('route와 Viewer는 component 간 token 없이 각 near-end UI 요청을 시작한다', async () => {
    await renderRouteAndViewer();

    documentElement.scrollHeight = 2400;
    await act(async () => documentScrollListener?.());

    const scroll = renderer!.root.findByProps({ testID: 'post-media-viewer-thread-scroll' });
    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
      scroll.props.onContentSizeChange(0, 1200);
    });

    assert.equal(loadNextCalls, 2);
  });

  it('Viewer 오른쪽 scroller만 near-end reply page를 요청한다', async () => {
    await render('viewer');
    const scroll = renderer!.root.findByProps({ testID: 'post-media-viewer-thread-scroll' });

    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
      scroll.props.onContentSizeChange(0, 1200);
    });

    assert.equal(documentScrollListener, null);
    assert.equal(loadNextCalls, 1);
  });

  it('Viewer page 완료 후에도 near-end이면 저장된 metrics로 다음 page를 요청한다', async () => {
    await render('viewer');
    const scroll = renderer!.root.findByProps({ testID: 'post-media-viewer-thread-scroll' });

    await act(async () => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
      scroll.props.onContentSizeChange(0, 1200);
    });
    await act(async () => {
      scroll.props.onContentSizeChange(0, 1400);
    });
    assert.equal(loadNextCalls, 1);

    await act(async () => {
      loadNextCompletions[0]?.(null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(loadNextCalls, 2);
  });

  it('route와 Viewer의 page 오류와 재시도는 각 surface에만 남는다', async () => {
    await renderRouteAndViewer();

    documentElement.scrollHeight = 2400;
    await act(async () => documentScrollListener?.());
    await act(async () => loadNextCompletionsByKey.route?.[0]?.(new Error('route failure')));

    const route = renderer!.root.findByProps({ testID: 'post-detail-scroll' });
    const viewer = renderer!.root.findByProps({ testID: 'post-media-viewer-thread-scroll' });
    assert.equal(route.findAllByProps({ accessibilityRole: 'alert' }).length, 1);
    assert.equal(viewer.findAllByProps({ accessibilityRole: 'alert' }).length, 0);

    await act(async () => {
      viewer.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
      viewer.props.onContentSizeChange(0, 1200);
    });
    await act(async () => loadNextCompletionsByKey.viewer?.[0]?.(new Error('viewer failure')));
    assert.equal(route.findAllByProps({ accessibilityRole: 'alert' }).length, 1);
    assert.equal(viewer.findAllByProps({ accessibilityRole: 'alert' }).length, 1);

    await act(async () => route.findByProps({ children: '답글 다시 불러오기' }).props.onPress());
    await act(async () => viewer.findByProps({ children: '답글 다시 불러오기' }).props.onPress());

    assert.equal(loadNextCallsByKey.route, 2);
    assert.equal(loadNextCallsByKey.viewer, 2);
  });
});

async function renderRouteAndViewer() {
  await act(async () => {
    renderer = create(
      createElement(
        Fragment,
        null,
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'route-thread',
          post: { testPaginationKey: 'route' } as never,
          presentation: 'route',
        } as never),
        createElement(PostDetailThread, {
          header: null,
          identity: 'viewer-thread',
          post: { testPaginationKey: 'viewer' } as never,
          presentation: 'viewer',
        } as never),
      ),
    );
  });
  assert.ok(renderer);
}

async function render(presentation: 'route' | 'viewer') {
  await act(async () => {
    renderer = create(
      createElement(PostDetailThread, {
        header: createElement('Header'),
        identity: 'thread-identity',
        post: {} as never,
        presentation,
      }),
    );
  });
  assert.ok(renderer);
}
