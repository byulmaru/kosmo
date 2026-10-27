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
const documentScrollListeners = new Set<() => void>();
const documentKeydownListeners = new Set<(event: KeyboardEvent) => void>();
let loadNextCalls = 0;
let loadNextCompletions: Array<(error: Error | null) => void> = [];
let loadNextCallsByKey: Record<string, number> = {};
let loadNextCompletionsByKey: Record<string, Array<(error: Error | null) => void>> = {};
const platform = { OS: 'web' };
const windowDimensions = { height: 800, width: 1200 };
let shellChromePresent = false;
const headerViewportStyle = { top: '0px' };
const documentElement = { scrollHeight: 2401 };

Object.assign(globalThis, {
  cancelAnimationFrame: () => undefined,
  document: { documentElement },
  innerHeight: 800,
  getComputedStyle: () => headerViewportStyle,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
  scrollY: 800,
  window: globalThis,
});

globalThis.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
  if (type === 'scroll') {
    documentScrollListeners.add(listener as () => void);
    documentScrollListener = () => documentScrollListeners.forEach((callback) => callback());
  }
  if (type === 'keydown') {
    documentKeydownListeners.add(listener as (event: KeyboardEvent) => void);
  }
}) as typeof globalThis.addEventListener;
globalThis.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
  if (type === 'scroll') {
    documentScrollListeners.delete(listener as () => void);
    if (documentScrollListeners.size === 0) {
      documentScrollListener = null;
    }
  }
  if (type === 'keydown') {
    documentKeydownListeners.delete(listener as (event: KeyboardEvent) => void);
  }
}) as typeof globalThis.removeEventListener;

mock.module('react-native', {
  exports: {
    Platform: platform,
    ScrollView: 'ScrollView',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => windowDimensions,
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

mock.module('@/components/post/PostComposerCoordinator', {
  exports: { PostComposerCoordinatorProvider: ({ children }: PropsWithChildren) => children },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@/components/shell/ShellChromeContext', {
  exports: { useShellChrome: () => (shellChromePresent ? {} : null) },
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
    breakpoints: { compact: 768, full: 1_280 },
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
  platform.OS = 'web';
  windowDimensions.width = 1200;
  shellChromePresent = false;
  headerViewportStyle.top = '0px';
  Object.assign(globalThis, { innerHeight: 800, scrollY: 800 });
  documentElement.scrollHeight = 2401;
  documentScrollListener = null;
  documentScrollListeners.clear();
  documentKeydownListeners.clear();
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

describe('PostDetailThread Native initial target scroll', () => {
  it('진입 prop 없이 대상 답글부터 표시하고 지연 이미지 보정과 수동 이동을 유지한다', async () => {
    platform.OS = 'ios';
    let offset = 0;
    let sourceContentTop = 2100;
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'native-source',
          post: {} as never,
          presentation: 'route',
        }),
        {
          createNodeMock: (element) => {
            if ((element.props as Record<string, unknown>).testID === 'post-detail-scroll') {
              return {
                getNativeScrollRef: () => ({
                  measureInWindow: (done: (...args: number[]) => void) => done(0, 126, 390, 700),
                }),
                scrollTo: ({ y }: { y: number }) => {
                  offset = y;
                  renderer!.root.findByProps({ testID: 'post-detail-scroll' }).props.onScroll({
                    nativeEvent: {
                      contentOffset: { y },
                      layoutMeasurement: { height: 700 },
                      contentSize: { height: 8000 },
                    },
                  });
                },
              };
            }
            if (
              (element.props as Record<string, unknown>).testID ===
              'post-thread-current-post-current'
            ) {
              return {
                measureInWindow: (done: (...args: number[]) => void) =>
                  done(0, 126 + sourceContentTop - offset, 390, 200),
              };
            }
            return {
              measureInWindow: (done: (...args: number[]) => void) =>
                done(0, 126 - offset, 390, 64),
            };
          },
        },
      );
    });
    const scroll = renderer!.root.findByProps({ testID: 'post-detail-scroll' });
    const header = scroll
      .findAllByType('View' as never)
      .find((node) => node.props.style?.zIndex === 10)!;
    const flush = async () => {
      await act(async () => {
        while (frames.length) {
          frames.shift()!(0);
        }
      });
    };
    await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: 700 } } }));
    await act(async () => header.props.onLayout({ nativeEvent: { layout: { height: 64 } } }));
    await flush();
    assert.equal(offset, 2036);
    sourceContentTop = 1800;
    await act(async () => scroll.props.onContentSizeChange(390, 7700));
    await flush();
    assert.equal(offset, 1736);
    assert.equal(126 + sourceContentTop - offset, 190);
    await act(async () => scroll.props.onScrollBeginDrag());
    offset = 2400;
    await act(async () =>
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: { y: offset },
          layoutMeasurement: { height: 700 },
          contentSize: { height: 7700 },
        },
      }),
    );
    sourceContentTop = 1600;
    await act(async () => scroll.props.onContentSizeChange(390, 7500));
    await flush();
    assert.equal(offset, 2400);
  });

  it('사용자 스크롤 뒤 상단 조상이 추가되면 보이는 current 위치만 보정하고 초기 anchor는 재설정하지 않는다', async () => {
    platform.OS = 'ios';
    let offset = 300;
    let currentDocumentTop = 950;
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'native-late-ancestor',
          post: {} as never,
          presentation: 'route',
        }),
        {
          createNodeMock: (element) => {
            const testID = (element.props as Record<string, unknown>).testID;
            if (testID === 'post-detail-scroll') {
              return {
                getNativeScrollRef: () => ({
                  measureInWindow: (done: (...args: number[]) => void) => done(0, 100, 390, 700),
                }),
                scrollTo: ({ y }: { y: number }) => {
                  offset = y;
                  renderer!.root.findByProps({ testID: 'post-detail-scroll' }).props.onScroll({
                    nativeEvent: {
                      contentOffset: { y },
                      layoutMeasurement: { height: 700 },
                      contentSize: { height: 8000 },
                    },
                  });
                },
              };
            }
            if (testID === 'post-thread-current-post-current') {
              return {
                measureInWindow: (done: (...args: number[]) => void) =>
                  done(0, 100 + currentDocumentTop - offset, 390, 200),
              };
            }
            return {
              measureInWindow: (done: (...args: number[]) => void) => done(0, 0, 390, 64),
            };
          },
        },
      );
    });
    const scroll = renderer!.root.findByProps({ testID: 'post-detail-scroll' });
    await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: 700 } } }));
    await act(async () => scroll.props.onScrollBeginDrag());
    await act(async () =>
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: { y: offset },
          layoutMeasurement: { height: 700 },
          contentSize: { height: 8000 },
        },
      }),
    );
    assert.equal(100 + currentDocumentTop - offset, 750);

    currentDocumentTop += 200;
    await act(async () => scroll.props.onContentSizeChange(390, 8200));
    assert.equal(offset, 500);
    assert.equal(100 + currentDocumentTop - offset, 750);

    await act(async () => {
      while (frames.length) {
        frames.shift()!(0);
      }
    });
    assert.equal(offset, 500);
  });

  it('사용자 스크롤 중 완료된 layout 측정 결과는 다음 offset에 섞이지 않는다', async () => {
    platform.OS = 'ios';
    let offset = 300;
    let currentDocumentTop = 950;
    const pendingCurrentMeasures: Array<(...args: number[]) => void> = [];
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'native-stale-layout',
          post: {} as never,
          presentation: 'route',
        }),
        {
          createNodeMock: (element) => {
            const testID = (element.props as Record<string, unknown>).testID;
            if (testID === 'post-detail-scroll') {
              return {
                getNativeScrollRef: () => ({
                  measureInWindow: (done: (...args: number[]) => void) => done(0, 100, 390, 700),
                }),
                scrollTo: ({ y }: { y: number }) => {
                  offset = y;
                },
              };
            }
            if (testID === 'post-thread-current-post-current') {
              return {
                measureInWindow: (done: (...args: number[]) => void) => {
                  pendingCurrentMeasures.push(done);
                },
              };
            }
            return {
              measureInWindow: (done: (...args: number[]) => void) => done(0, 0, 390, 64),
            };
          },
        },
      );
    });
    const scroll = renderer!.root.findByProps({ testID: 'post-detail-scroll' });
    await act(async () => scroll.props.onScrollBeginDrag());
    await act(async () =>
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: { y: offset },
          layoutMeasurement: { height: 700 },
          contentSize: { height: 8000 },
        },
      }),
    );
    currentDocumentTop += 200;
    await act(async () => scroll.props.onContentSizeChange(390, 8200));
    offset = 400;
    await act(async () =>
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: { y: offset },
          layoutMeasurement: { height: 700 },
          contentSize: { height: 8200 },
        },
      }),
    );

    for (const measure of pendingCurrentMeasures.splice(0)) {
      measure(0, 100 + currentDocumentTop - offset, 390, 200);
    }
    assert.equal(offset, 400);
    assert.equal(frames.length, 1);
  });
});

describe('PostDetailThread Web initial target scroll cleanup', () => {
  for (const mobile of [false, true]) {
    it(`짧은 ${mobile ? 'mobile shell' : 'standalone'} 상세의 잘린 sticky header 대신 viewport 상단에 정렬한다`, async () => {
      windowDimensions.width = mobile ? 390 : 1200;
      shellChromePresent = mobile;
      headerViewportStyle.top = mobile ? '64px' : '0px';
      documentElement.scrollHeight = 844;
      Object.assign(globalThis, { innerHeight: 657, scrollY: 2446 });
      const frames: FrameRequestCallback[] = [];
      globalThis.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
      };
      globalThis.scrollTo = ((options: ScrollToOptions) => {
        Object.assign(globalThis, { scrollY: options.top });
      }) as typeof globalThis.scrollTo;
      await act(async () => {
        renderer = create(
          createElement(PostDetailThread, {
            header: mobile ? null : createElement('Header'),
            identity: 'short-mobile-viewport',
            post: {} as never,
          }),
          {
            createNodeMock: (element) => ({
              measureInWindow: (done: (...values: number[]) => void) => {
                const current =
                  (element.props as Record<string, unknown>).testID ===
                  'post-thread-current-post-current';
                if (current) {
                  done(0, -2382, 390, 180);
                } else {
                  done(0, mobile ? -2202 : -2266, 390, mobile ? 0 : 64);
                }
              },
            }),
          },
        );
      });
      await act(async () => {
        while (frames.length) {
          frames.shift()!(0);
        }
      });
      assert.equal(globalThis.scrollY, 0);
    });
  }

  it('current와 header의 비동기 측정 사이에 브라우저가 offset을 조정해도 문서의 대상 위치를 유지한다', async () => {
    Object.assign(globalThis, { scrollY: 2446 });
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    globalThis.scrollTo = ((options: ScrollToOptions) => {
      Object.assign(globalThis, { scrollY: options.top });
    }) as typeof globalThis.scrollTo;
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'viewport-offset-adjustment',
          post: {} as never,
        }),
        {
          createNodeMock: (element) => ({
            measureInWindow: (done: (...values: number[]) => void) => {
              const current =
                (element.props as Record<string, unknown>).testID ===
                'post-thread-current-post-current';
              if (current) {
                done(0, -1546, 390, 180);
              } else {
                Object.assign(globalThis, { scrollY: 187 });
                done(0, 0, 390, 64);
              }
            },
          }),
        },
      );
    });
    await act(async () => {
      while (frames.length) {
        frames.shift()!(0);
      }
    });
    assert.equal(globalThis.scrollY, 836);
  });

  for (const restorationStartsAt of ['frame', 'current measurement', 'header measurement']) {
    it(`재사용된 상세는 ${restorationStartsAt} 대기 중 시작된 history 복원을 덮지 않는다`, async () => {
      const frames: FrameRequestCallback[] = [];
      const measurements: Array<() => void> = [];
      let preservingScrollPosition = false;
      let offset = 120;
      globalThis.scrollTo = ((options: ScrollToOptions) => {
        offset = options.top!;
      }) as typeof globalThis.scrollTo;
      globalThis.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
      };
      await act(async () => {
        renderer = create(
          createElement(PostDetailThread, {
            header: createElement('Header'),
            identity: 'reused-history-route',
            post: {} as never,
            preserveScrollPosition: () => preservingScrollPosition,
          }),
          {
            createNodeMock: (element) => ({
              measureInWindow: (done: (...values: number[]) => void) => {
                const current =
                  (element.props as Record<string, unknown>).testID ===
                  'post-thread-current-post-current';
                measurements.push(() => done(0, current ? 1200 : 0, 390, current ? 200 : 64));
              },
            }),
          },
        );
      });
      if (restorationStartsAt !== 'frame') {
        await act(async () => {
          while (frames.length) {
            frames.shift()!(0);
          }
        });
        assert.equal(measurements.length, 1);
      }
      if (restorationStartsAt === 'header measurement') {
        await act(async () => measurements.shift()!());
        assert.equal(measurements.length, 1);
      }

      // POP can reuse this rendered tree without updating its props.
      preservingScrollPosition = true;
      await act(async () => {
        while (frames.length) {
          frames.shift()!(0);
        }
        while (measurements.length) {
          measurements.shift()!();
        }
      });
      assert.equal(offset, 120);
    });
  }

  it('초기 positioning이 꺼진 route는 현재 Post로 자동 scroll하지 않는다', async () => {
    const frames: FrameRequestCallback[] = [];
    const scrollTo = mock.fn();
    let measureCalls = 0;
    globalThis.scrollTo = scrollTo;
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'history-restored-route',
          preserveScrollPosition: () => true,
          post: {} as never,
        }),
        {
          createNodeMock: () => ({
            measureInWindow: (done: (...values: number[]) => void) => {
              measureCalls += 1;
              done(0, 1200, 390, 200);
            },
          }),
        },
      );
    });
    const scroll = renderer!.root.findByProps({ testID: 'post-detail-scroll' });
    const header = scroll.findAllByType('View' as never).find((node) => node.props.onLayout)!;
    await act(async () => header.props.onLayout({ nativeEvent: { layout: { height: 64 } } }));
    await act(async () => {
      while (frames.length) {
        frames.shift()!(0);
      }
    });

    assert.equal(measureCalls, 0);
    assert.equal(scrollTo.mock.callCount(), 0);
  });

  it('초기 history 복원이 끝나면 같은 route 인스턴스의 positioning을 재개한다', async () => {
    const frames: FrameRequestCallback[] = [];
    const scrollTo = mock.fn();
    let preservingScrollPosition = true;
    globalThis.scrollTo = scrollTo;
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'history-restored-forward-route',
          preserveScrollPosition: () => preservingScrollPosition,
          post: {} as never,
        }),
        {
          createNodeMock: (element) => ({
            measureInWindow: (done: (...values: number[]) => void) => {
              const current =
                (element.props as Record<string, unknown>).testID ===
                'post-thread-current-post-current';
              done(0, current ? 1200 : 0, 390, current ? 200 : 64);
            },
          }),
        },
      );
    });
    assert.equal(scrollTo.mock.callCount(), 0);

    preservingScrollPosition = false;
    const scroll = renderer!.root.findByProps({ testID: 'post-detail-scroll' });
    const header = scroll.findAllByType('View' as never).find((node) => node.props.onLayout)!;
    await act(async () => header.props.onLayout({ nativeEvent: { layout: { height: 64 } } }));
    await act(async () => {
      while (frames.length) {
        frames.shift()!(0);
      }
    });

    assert.equal(scrollTo.mock.callCount(), 1);
  });

  it('editable 입력의 Space는 초기 anchor를 취소하지 않는다', async () => {
    const frames: FrameRequestCallback[] = [];
    const scrollTo = mock.fn();
    globalThis.scrollTo = scrollTo;
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'editable-space',
          post: {} as never,
        }),
        {
          createNodeMock: (element) => ({
            measureInWindow: (done: (...values: number[]) => void) => {
              const current =
                (element.props as Record<string, unknown>).testID ===
                'post-thread-current-post-current';
              done(0, current ? 1200 : 0, 390, current ? 200 : 64);
            },
          }),
        },
      );
    });

    await act(async () => {
      for (const listener of documentKeydownListeners) {
        listener({
          defaultPrevented: false,
          key: ' ',
          target: { isContentEditable: false, tagName: 'TEXTAREA' },
        } as unknown as KeyboardEvent);
      }
      while (frames.length) {
        frames.shift()!(0);
      }
    });

    assert.equal(scrollTo.mock.callCount(), 1);
  });

  it('mount 후 초기 positioning을 끄면 대기 중인 alignment도 취소한다', async () => {
    const frames: FrameRequestCallback[] = [];
    const scrollTo = mock.fn();
    let measureCalls = 0;
    globalThis.scrollTo = scrollTo;
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'history-restored-route',
          post: {} as never,
        }),
        {
          createNodeMock: () => ({
            measureInWindow: (done: (...values: number[]) => void) => {
              measureCalls += 1;
              done(0, 1200, 390, 200);
            },
          }),
        },
      );
    });
    assert.ok(frames.length > 0);

    await act(async () => {
      renderer!.update(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'history-restored-route',
          preserveScrollPosition: () => true,
          post: {} as never,
        }),
      );
    });

    await act(async () => {
      while (frames.length) {
        frames.shift()!(0);
      }
    });

    assert.equal(measureCalls, 0);
    assert.equal(scrollTo.mock.callCount(), 0);
  });

  it('측정 중 상세를 떠나면 늦은 결과가 복원된 화면을 스크롤하지 않는다', async () => {
    const frames: FrameRequestCallback[] = [];
    let measureCurrent: ((...values: number[]) => void) | undefined;
    const scrollTo = mock.fn();
    globalThis.scrollTo = scrollTo;
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    await act(async () => {
      renderer = create(
        createElement(PostDetailThread, {
          header: createElement('Header'),
          identity: 'web-target',
          post: {} as never,
        }),
        {
          createNodeMock: (element) => ({
            measureInWindow: (done: (...values: number[]) => void) => {
              if (
                (element.props as Record<string, unknown>).testID ===
                'post-thread-current-post-current'
              ) {
                measureCurrent = done;
              } else {
                done(0, 0, 390, 64);
              }
            },
          }),
        },
      );
    });
    await act(async () => {
      while (frames.length) {
        frames.shift()!(0);
      }
    });
    assert.ok(measureCurrent);
    await act(async () => renderer!.unmount());
    renderer = null;
    await act(async () => measureCurrent!(0, 1200, 390, 200));
    assert.equal(scrollTo.mock.callCount(), 0);
  });
});
