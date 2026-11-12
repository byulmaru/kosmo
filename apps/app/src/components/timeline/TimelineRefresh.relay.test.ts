import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Fragment, useEffect } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  ROOT_ID,
  Store,
} from 'relay-runtime';
import { WebPushPermissionContext } from '@/components/native-push/webPushPermissionContext';
import { colors } from '@/theme/tokens';
import deletePostMutation from '../post/__generated__/PostDeletionActionDeletePostMutation.graphql';
import { createTabReselectionRegistry } from '../shell/tabReselection';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, Variables } from 'relay-runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let renderer: ReactTestRenderer | null = null;
let HomeTimelineScreen: ComponentType;
let TimelineTabs: ComponentType<{ value: 'home' | 'local' | 'federated' }>;
let LocalTimelineScreen: ComponentType<{ publicEntry?: boolean }>;
let FederatedTimelineScreen: ComponentType;
const platform = { OS: 'ios' };
let sessionStatus: 'error' | 'guest' | 'valid' = 'valid';
let postRequestSummaryMode: 'empty' | 'pending' | 'error' | 'ready' = 'empty';
const pendingPostRequestSummary = new Promise<never>(() => undefined);
const openProfileSwitcher = mock.fn();
const browserListeners = new Map<string, () => void>();
const browserScrollCalls: unknown[] = [];
const browserWindow = {
  scrollY: 0,
  innerHeight: 600,
  scrollTo: (options: unknown) => {
    browserScrollCalls.push(options);
    if (typeof options === 'object' && options !== null && 'top' in options) {
      browserWindow.scrollY = Number(options.top);
      browserListeners.get('scroll')?.();
    }
  },
  addEventListener: (type: string, listener: () => void) => browserListeners.set(type, listener),
  removeEventListener: (type: string) => browserListeners.delete(type),
  requestAnimationFrame: (callback: () => void) => {
    callback();
    return 1;
  },
  cancelAnimationFrame: () => undefined,
};
const browserDocument = {
  visibilityState: 'visible',
  documentElement: { scrollHeight: 10000 },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
const appState = {
  addEventListener: () => ({ remove: () => undefined }),
};
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
type Request = {
  name: string;
  variables: Variables;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
};
const requests: Request[] = [];
type Subscription = Request & {
  connected?: (reconnected: boolean) => void;
  disposed: boolean;
};
const subscriptions: Subscription[] = [];
const toasts: Array<{
  message: string;
  options: { action?: { onPress: () => void }; persistent?: boolean };
  visible: boolean;
}> = [];
const showToast = (message: string, options: (typeof toasts)[number]['options']) => {
  const toast = { message, options, visible: true };
  toasts.push(toast);
  return () => {
    toast.visible = false;
  };
};
const navigations: unknown[] = [];
const tabRegistry = createTabReselectionRegistry();
let homeReselectionHandler: (() => void) | null = null;
let homeFocusEffect: (() => void | (() => void)) | null = null;
let homeFocusCleanup: (() => void) | null = null;
const registerHomeReselection = (handler: () => void) => {
  homeReselectionHandler = handler;
  return () => {
    if (homeReselectionHandler === handler) {
      homeReselectionHandler = null;
    }
  };
};
const shellChrome = {
  openProfileSwitcher,
  registerHomeReselection,
  registerTabReselection: tabRegistry.register,
  reselectTab: tabRegistry.reselect,
  reselectHome: () => homeReselectionHandler?.(),
};

function timelineScreenWithPushContext(timeline: 'Home' | 'Local' | 'Federated') {
  const screen = createElement(
    timeline === 'Home'
      ? HomeTimelineScreen
      : timeline === 'Local'
        ? LocalTimelineScreen
        : FederatedTimelineScreen,
  );
  return timeline === 'Home'
    ? createElement(
        WebPushPermissionContext.Provider,
        {
          value: {
            permission: 'default',
            requestPermission: async () => undefined,
            support: 'unsupported',
          },
        },
        screen,
      )
    : screen;
}
class AnimatedValueMock {
  constructor(public value: number) {}
  setValue(value: number) {
    this.value = value;
  }
  stopAnimation() {}
}

class AnimatedColorMock {
  constructor(public value: string) {}
  setValue(value: string) {
    this.value = value;
  }
  stopAnimation() {}
}

// Only resolve graphql tags to compiler artifacts; all Relay hooks and normalization are real.
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation|subscription) (\w+)/)?.[1];
    assert.ok(name);
    return require(
      `${name.startsWith('PostList') || name.startsWith('ProfilePinOrder') ? '../post' : '.'}/__generated__/${name}.graphql.ts`,
    ).default;
  },
});
mockModule('expo-router', {
  useFocusEffect: (effect: () => void | (() => void)) => {
    useEffect(() => {
      homeFocusEffect = effect;
      return () => {
        homeFocusCleanup?.();
        homeFocusCleanup = null;
        if (homeFocusEffect === effect) {
          homeFocusEffect = null;
        }
      };
    }, [effect]);
  },
  useRouter: () => ({
    replace: (href: string) => navigations.push(href),
    setParams: (params: object) => navigations.push(params),
  }),
  useIsFocused: () => true,
  Redirect: ({ href }: { href: string }) => createElement('Redirect', { href }),
});
mockModule('lucide-react-native', {
  Bell: 'Bell',
  UserRoundPlus: 'UserRoundPlus',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
});
mockModule(require.resolve('lucide-react-native'), {
  Bell: 'Bell',
  UserRoundPlus: 'UserRoundPlus',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
});
mockModule('react-native', {
  AppState: appState,
  Platform: platform,
  Animated: {
    Color: AnimatedColorMock,
    Text: 'Text',
    Value: AnimatedValueMock,
    View: 'View',
    subtract: (a: AnimatedValueMock, b: AnimatedValueMock) => a.value - b.value,
  },
  Easing: {},
  Pressable: ({ children, ...props }: { children: (state: { pressed: boolean }) => ReactNode }) =>
    createElement('Pressable', props, children({ pressed: false })),
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  FlatList: (props: {
    data: unknown[];
    keyExtractor: (item: unknown, index: number) => string;
    ListEmptyComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ListHeaderComponent?: ReactNode;
    renderItem: (value: object) => ReactNode;
  }) =>
    createElement(
      'FlatList',
      props,
      props.ListHeaderComponent,
      props.data.length === 0
        ? props.ListEmptyComponent
        : props.data.map((item, index) =>
            createElement(
              Fragment,
              { key: props.keyExtractor(item, index) },
              props.renderItem({ item, index }),
            ),
          ),
      props.ListFooterComponent,
    ),
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 390 }),
  View: 'View',
});
mockModule('@/components/PageHeader', { PageHeader: () => null });

function MockPostRequestListSummary() {
  if (postRequestSummaryMode === 'pending') {
    throw pendingPostRequestSummary;
  }
  if (postRequestSummaryMode === 'error') {
    throw new Error('post requests unavailable');
  }
  return postRequestSummaryMode === 'ready'
    ? createElement('Text', { accessibilityLabel: '게시 요청 요약' }, '게시 요청 요약')
    : null;
}

mockModule('@/components/post/PostRequestList', {
  PostRequestHomeSummaryFallback: () => null,
  PostRequestHomeSummaryLoading: () => null,
  PostRequestListSummary: MockPostRequestListSummary,
});
mockModule('@/components/shell/NavigationDrawerTrigger', { NavigationDrawerTrigger: () => null });
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
});

mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'actor',
});
mockModule('@/session/SessionProvider', { useSession: () => ({ status: sessionStatus }) });
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => shellChrome });
mockModule('@/components/shell/shellLayout', {
  getShellLayout: () => 'mobile',
});
mockModule('@/components/ui/Button', {
  Button: ({
    accessibilityLabel,
    children,
    ...props
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    [key: string]: unknown;
  }) =>
    createElement(
      'Button',
      {
        ...props,
        accessibilityLabel:
          accessibilityLabel ?? (typeof children === 'string' ? children : undefined),
        accessibilityRole: 'button',
      },
      children,
    ),
});
mockModule('@/components/ui/StateView', {
  Skeleton: () => null,
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => colors.light,
  useReducedMotion: () => true,
});

// Mock unrelated row UI/providers, retaining PostList, InfiniteList and loadNext behavior.
for (const name of ['PostActionAuthentication', 'PostComposerCoordinator', 'PostMediaViewerHost']) {
  mockModule(new URL(`../post/${name}.tsx`, import.meta.url), {
    [`${name}Provider`]: ({ children }: { children: ReactNode }) => children,
  });
}
let rowRenders = 0;
mockModule(new URL('../post/PostListItem.tsx', import.meta.url), {
  PostListItem: ({ post }: { post: { __id: string } }) => (
    rowRenders++,
    createElement('PostRow', { id: post.__id })
  ),
});
mockModule(new URL('../pagination/PaginationScrollView.tsx', import.meta.url), {
  usePaginationScrollContext: () => false,
  usePaginationScrollRegistration: () => undefined,
});

before(async () => {
  ({ TimelineTabs } = await import('../TimelineTabs'));
  ({ default: HomeTimelineScreen } = await import('./HomeTimelineScreen'));
  ({ default: LocalTimelineScreen } = await import('./LocalTimelineScreen'));
  ({ default: FederatedTimelineScreen } = await import('./FederatedTimelineScreen'));
});
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  browserWindow.scrollY = 0;
  browserDocument.visibilityState = 'visible';
  browserDocument.documentElement.scrollHeight = 10000;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: browserDocument });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
  subscriptions.length = 0;
  toasts.length = 0;
  platform.OS = 'ios';
  sessionStatus = 'valid';
  postRequestSummaryMode = 'empty';
  browserWindow.scrollY = 0;
  browserScrollCalls.length = 0;
  browserListeners.clear();
  homeReselectionHandler = null;
  homeFocusEffect = null;
  homeFocusCleanup = null;
  openProfileSwitcher.mock.resetCalls();
  for (const [key, descriptor] of [
    ['window', originalWindow],
    ['document', originalDocument],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
  navigations.length = 0;
});

const profile = {
  id: 'profile-a',
  displayName: 'Author',
  handle: 'author',
  relativeHandle: '@author',
  avatar: null,
  instance: null,
  private: { defaultPostVisibility: 'PUBLIC' },
  viewerState: { blockedBy: false, isSelf: true, profileBlock: null, profileMute: null },
};
function payload(
  field: string,
  ids: string[],
  hasNextPage = true,
  endCursor = `cursor-${ids.at(-1)}`,
) {
  return {
    currentSession: { id: 'session', selectedProfile: profile },
    me: { id: 'account', name: 'Author', profiles: [{ id: profile.id }] },
    [field]: {
      edges: ids.map((id) => ({
        cursor: `cursor-${id}`,
        node: {
          __typename: 'Post',
          id,
          createdAt: '2026-09-26T00:00:00Z',
          profile,
          content: {
            id: `content-${id}`,
            bodyText: id,
            contentWarning: null,
            linkPreview: null,
            document: null,
            media: [],
            mentionedProfiles: [],
          },
          replyParent: null,
          repostSource: null,
          replyCount: 0,
          isPinned: false,
          visibility: 'PUBLIC',
          state: 'ACTIVE',
          viewerBookmark: null,
          viewerRepost: null,
          viewerReactions: [],
          reactionCounts: [],
          repostCount: 0,
        },
      })),
      pageInfo: { endCursor, hasNextPage },
    },
  };
}
function latest(name: string) {
  const request = requests.findLast((request) => request.name === name);
  assert.ok(request, `Missing ${name}`);
  return request;
}
async function respond(request: Request, data: object) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}
async function focusHome() {
  const effect = homeFocusEffect;
  assert.ok(effect, 'Home should register its focus revalidation');
  await act(async () => {
    homeFocusCleanup?.();
    const cleanup = effect();
    homeFocusCleanup = typeof cleanup === 'function' ? cleanup : null;
  });
}
async function scrollHomeTo(y: number) {
  await act(async () => {
    list().props.onScroll({ nativeEvent: { contentOffset: { y } } });
  });
}
function homePost(id: string) {
  const homeTimeline = payload('homeTimeline', [id]).homeTimeline as {
    edges: Array<{ node: unknown }>;
  };
  const post = homeTimeline.edges[0]?.node;
  assert.ok(post);
  return post;
}
function emitHomeTimelineEvent(subscription: Subscription, post: object | null) {
  const response = {
    data: { timeline: { __typename: 'TimelinePostAdded', post } },
  } as GraphQLResponse;
  subscription.sink.next(response);
}
function emitHomePost(subscription: Subscription, id: string) {
  emitHomeTimelineEvent(subscription, homePost(id));
}
function createTimelineNetwork() {
  return Network.create(
    (operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, variables, sink });
      }),
    (operation, variables, cacheConfig) =>
      Observable.create<GraphQLResponse>((sink) => {
        const connected = cacheConfig.metadata?.onSubscriptionConnected;
        const subscription: Subscription = {
          name: operation.name,
          variables,
          sink,
          connected:
            typeof connected === 'function'
              ? (connected as (reconnected: boolean) => void)
              : undefined,
          disposed: false,
        };
        subscriptions.push(subscription);
        return () => {
          subscription.disposed = true;
        };
      }),
  );
}
function list() {
  assert.ok(renderer);
  return renderer.root.find((node) => (node.type as unknown) === 'FlatList');
}
function loadMoreButton() {
  assert.ok(renderer);
  return renderer.root.findByProps({ accessibilityLabel: '더 보기', accessibilityRole: 'button' });
}
function assertConnection(
  environment: Environment,
  field: string,
  ids: string[],
  hasNextPage = true,
  endCursor = `cursor-${ids.at(-1)}`,
  edgeCursors: readonly (string | null)[] = ids.map((id) => `cursor-${id}`),
) {
  assert.ok(renderer);
  assert.deepEqual(
    renderer.root
      .findAll((node) => (node.type as unknown) === 'PostRow')
      .map((node) => node.props.id),
    ids,
  );
  const source = environment.getStore().getSource();
  const connection = source.get(
    ConnectionHandler.getConnectionID('client:root', `PostList_${field}`),
  );
  assert.ok(connection);
  const edgeIds = (connection.edges as { __refs: string[] }).__refs;
  assert.deepEqual(
    edgeIds.map((edgeId) => (source.get(edgeId)?.node as { __ref: string }).__ref),
    ids,
  );
  assert.deepEqual(
    edgeIds.map((edgeId) => source.get(edgeId)?.cursor),
    edgeCursors,
  );
  const pageInfo = source.get((connection.pageInfo as { __ref: string }).__ref);
  assert.equal(pageInfo?.endCursor, endCursor);
  assert.equal(pageInfo?.hasNextPage, hasNextPage);
}

describe('Timeline refresh and pagination with real Relay', () => {
  it('Home: pending optional request summary preserves actual posts and connection', async () => {
    postRequestSummaryMode = 'pending';
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });

    await respond(latest('HomePageQuery'), payload('homeTimeline', ['a', 'b']));

    assert.equal(renderer!.root.findAllByProps({ accessibilityLabel: '게시 요청 요약' }).length, 0);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
  });

  it('Home subscription prepends actual Posts once and preserves the server pagination cursor', async () => {
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['a', 'b']));
    const subscription = subscriptions.findLast(
      (candidate) => candidate.name === 'HomeTimelineSubscription',
    );
    assert.ok(subscription);
    assert.deepEqual(subscription.variables.connections, [
      ConnectionHandler.getConnectionID(ROOT_ID, 'PostList_homeTimeline'),
    ]);

    const requestCount = requests.length;
    await scrollHomeTo(480);
    await act(async () => emitHomeTimelineEvent(subscription, null));
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
    assert.equal(requests.length, requestCount);

    await act(async () => emitHomePost(subscription, 'incoming'));
    await act(async () => emitHomePost(subscription, 'incoming'));
    await act(async () => emitHomePost(subscription, 'a'));
    assert.equal(requests.length, requestCount, 'Post events do not trigger Home queries');
    assertConnection(environment, 'homeTimeline', ['incoming', 'a', 'b'], true, 'cursor-b', [
      null,
      'cursor-a',
      'cursor-b',
    ]);

    await act(async () => list().props.onEndReached());
    const nextPage = latest('PostListHomeNextPageQuery');
    assert.equal(nextPage.variables.cursor, 'cursor-b');
    await respond(nextPage, payload('homeTimeline', ['older'], false));
    assertConnection(
      environment,
      'homeTimeline',
      ['incoming', 'a', 'b', 'older'],
      false,
      'cursor-older',
      [null, 'cursor-a', 'cursor-b', 'cursor-older'],
    );
  });

  it('Home lifecycle read does not restore a streamed Post deleted before completion', async () => {
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });
    const initialRead = latest('HomePageQuery');
    await respond(initialRead, payload('homeTimeline', ['a', 'b']));

    const activeSubscription = subscriptions.findLast(
      (candidate) => candidate.name === 'HomeTimelineSubscription',
    );
    assert.ok(activeSubscription);

    await focusHome();
    const canonicalRead = latest('HomePageQuery');
    assert.notEqual(canonicalRead, initialRead);
    assert.equal(requests.length, 2);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);

    await act(async () => emitHomePost(activeSubscription, 'incoming'));
    assert.equal(requests.length, 2, 'A Post event does not start another Home query');
    assertConnection(environment, 'homeTimeline', ['incoming', 'a', 'b'], true, 'cursor-b', [
      null,
      'cursor-a',
      'cursor-b',
    ]);

    const deleteOperation = createOperationDescriptor(getRequest(deletePostMutation), {
      id: 'incoming',
    });
    await act(async () => {
      environment.commitPayload(deleteOperation, {
        deletePost: { postId: 'incoming', replyParent: null },
      });
    });

    await respond(canonicalRead, payload('homeTimeline', ['a', 'b']));
    assert.equal(requests.length, 2);
    assert.equal(environment.getStore().getSource().get('incoming'), null);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
  });

  it('Home: optional request summary error preserves posts and retries with Home refresh', async () => {
    postRequestSummaryMode = 'error';
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });

    const initialRequest = latest('HomePageQuery');
    await respond(initialRequest, payload('homeTimeline', ['a', 'b']));

    assert.equal(renderer!.root.findAllByProps({ accessibilityLabel: '게시 요청 요약' }).length, 0);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);

    postRequestSummaryMode = 'ready';
    await act(async () => list().props.onRefresh());

    const refresh = latest('HomePageQuery');
    assert.notEqual(refresh, initialRequest);
    assert.equal(list().props.refreshing, true);
    assert.equal(renderer!.root.findAllByProps({ accessibilityLabel: '게시 요청 요약' }).length, 1);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);

    await respond(refresh, payload('homeTimeline', ['fresh']));
    assert.equal(list().props.refreshing, false);
    assertConnection(environment, 'homeTimeline', ['fresh']);
  });

  it('Federated: refresh failure preserves rows and a successful retry replaces them', async () => {
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Federated'),
        }),
      );
    });
    await respond(latest('FederatedPageQuery'), payload('federatedTimeline', ['a', 'b']));
    assertConnection(environment, 'federatedTimeline', ['a', 'b']);

    await act(async () => list().props.onRefresh());
    const failedRefresh = latest('FederatedContentRefetchQuery');
    assert.equal(list().props.refreshing, true);
    assertConnection(environment, 'federatedTimeline', ['a', 'b']);
    await act(async () => failedRefresh.sink.error(new Error('refresh failed')));
    assert.equal(list().props.refreshing, false);
    assertConnection(environment, 'federatedTimeline', ['a', 'b']);

    const toast = visibleToast();
    await act(async () => toast.options.action!.onPress());
    const retry = latest('FederatedContentRefetchQuery');
    assert.notEqual(retry, failedRefresh);
    assert.equal(list().props.refreshing, true);
    await respond(retry, payload('federatedTimeline', ['fresh']));
    assert.equal(list().props.refreshing, false);
    assertConnection(environment, 'federatedTimeline', ['fresh']);
    assert.equal(toast.visible, false);
  });

  it('Home: cached re-entry keeps rows visible during a quiet latest refresh', async () => {
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    const render = () =>
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: timelineScreenWithPushContext('Home'),
      });

    await act(async () => {
      renderer = create(render());
    });
    assert.equal(requests.length, 1);
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['a', 'b']));
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
    const firstSubscription = subscriptions.at(-1);
    assert.ok(firstSubscription);

    await focusHome();
    assert.equal(requests.length, 2);
    assert.equal(list().props.refreshing, false);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['a', 'b']));

    await act(async () => {
      renderer?.unmount();
      renderer = create(render());
    });
    assert.equal(requests.length, 2, 'complete cache renders without a route query');
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
    assert.equal(firstSubscription.disposed, true);

    await focusHome();
    assert.equal(requests.length, 3, 'focus should check the latest Home data');
    assert.equal(list().props.refreshing, false);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['fresh', 'a']));
    assertConnection(environment, 'homeTimeline', ['fresh', 'a']);

    const activeSubscription = subscriptions.at(-1);
    assert.ok(activeSubscription);
    await scrollHomeTo(480);
    const beforePostEvent = requests.length;
    await act(async () => emitHomePost(activeSubscription, 'streamed'));
    assert.equal(
      requests.length,
      beforePostEvent,
      'a Post event updates Relay without a Home query',
    );
    assertConnection(environment, 'homeTimeline', ['streamed', 'fresh', 'a'], true, 'cursor-a', [
      null,
      'cursor-fresh',
      'cursor-a',
    ]);

    await scrollHomeTo(480);
    await act(async () => {
      activeSubscription.connected?.(false);
      activeSubscription.connected?.(true);
    });
    assert.equal(requests.length, beforePostEvent, 'revalidation waits while reading older posts');
    await scrollHomeTo(0);
    assert.equal(requests.length, beforePostEvent + 1, 'the pending revalidation runs at the top');
    assert.equal(list().props.refreshing, false);

    const interruptedRefresh = latest('HomePageQuery');
    await act(async () => activeSubscription.connected?.(true));
    await scrollHomeTo(480);
    const requestCountWhileReading = requests.length;
    await respond(interruptedRefresh, payload('homeTimeline', ['late']));
    assert.equal(requests.length, requestCountWhileReading);

    await scrollHomeTo(0);
    assert.equal(
      requests.length,
      requestCountWhileReading + 1,
      'returning to the top starts one fresh query after the interrupted response',
    );
    assert.equal(list().props.refreshing, false);
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['latest', 'fresh']));
    assertConnection(environment, 'homeTimeline', ['latest', 'fresh']);

    await act(async () => {
      renderer?.unmount();
      renderer = null;
    });
    environment.commitUpdate((store) => {
      store
        .get(ConnectionHandler.getConnectionID(ROOT_ID, 'PostList_homeTimeline'))
        ?.invalidateRecord();
    });
    await act(async () => {
      renderer = create(render());
    });
    assert.equal(requests.length, 6, 'invalidated cached data should still trigger a request');
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['fresh']));
    assertConnection(environment, 'homeTimeline', ['fresh']);
  });

  it('Home reselect turns queued lifecycle revalidation into one manual read', async () => {
    platform.OS = 'web';
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['a', 'b']));
    const activeSubscription = subscriptions.findLast(
      (candidate) => candidate.name === 'HomeTimelineSubscription',
    );
    assert.ok(activeSubscription);

    await act(async () => {
      browserWindow.scrollY = 480;
      browserListeners.get('scroll')?.();
    });
    const requestsBeforeReconnect = requests.length;
    await act(async () => activeSubscription.connected?.(true));
    assert.equal(requests.length, requestsBeforeReconnect);

    const scrollCallsBeforeReselect = browserScrollCalls.length;
    await act(async () => shellChrome.reselectHome());
    assert.ok(browserScrollCalls.length > scrollCallsBeforeReselect);
    assert.equal(browserWindow.scrollY, 0);
    assert.equal(requests.length, requestsBeforeReconnect + 1);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);

    await respond(latest('HomePageQuery'), payload('homeTimeline', ['fresh', 'a']));
    assert.equal(requests.length, requestsBeforeReconnect + 1);
    assertConnection(environment, 'homeTimeline', ['fresh', 'a']);

    await act(async () => activeSubscription.connected?.(true));
    assert.equal(requests.length, requestsBeforeReconnect + 2);
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['latest', 'fresh']));
    assertConnection(environment, 'homeTimeline', ['latest', 'fresh']);
  });

  it('Home reselect replaces an active automatic read and keeps the manual result', async () => {
    platform.OS = 'web';
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['a', 'b']));

    await focusHome();
    const automaticRead = latest('HomePageQuery');
    assert.equal(requests.length, 2);

    const scrollCallsBeforeReselect = browserScrollCalls.length;
    await act(async () => shellChrome.reselectHome());
    assert.ok(browserScrollCalls.length > scrollCallsBeforeReselect);
    assert.equal(requests.length, 3);
    const manualRead = latest('HomePageQuery');
    assert.notEqual(manualRead, automaticRead);
    assertConnection(environment, 'homeTimeline', ['a', 'b']);

    await act(async () => shellChrome.reselectHome());
    assert.equal(requests.length, 3, 'a repeated manual gesture should not start another read');

    await respond(manualRead, payload('homeTimeline', ['manual', 'a']));
    assertConnection(environment, 'homeTimeline', ['manual', 'a']);
    await respond(automaticRead, payload('homeTimeline', ['automatic', 'a']));
    assert.equal(requests.length, 3);
    assertConnection(environment, 'homeTimeline', ['manual', 'a']);
  });

  it('Home actor Environment replacement disposes its previous subscription owner', async () => {
    const firstEnvironment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    const nextEnvironment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    const render = (environment: Environment) =>
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: timelineScreenWithPushContext('Home'),
      });

    await act(async () => {
      renderer = create(render(firstEnvironment));
    });
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['first-actor']));
    const previousSubscription = subscriptions.findLast(
      (candidate) => candidate.name === 'HomeTimelineSubscription',
    );
    assert.ok(previousSubscription);

    const requestCountBeforeSwitch = requests.length;
    await act(async () => renderer?.update(render(nextEnvironment)));
    assert.equal(requests.length, requestCountBeforeSwitch + 1);
    await respond(latest('HomePageQuery'), payload('homeTimeline', ['next-actor']));

    const nextSubscription = subscriptions.findLast(
      (candidate) => candidate.name === 'HomeTimelineSubscription',
    );
    assert.ok(nextSubscription);
    assert.notEqual(nextSubscription, previousSubscription);
    assert.equal(previousSubscription.disposed, true);
    assertConnection(nextEnvironment, 'homeTimeline', ['next-actor']);
  });

  it('Home: continues through empty pages with each Relay cursor until a post is visible', async () => {
    platform.OS = 'web';
    browserDocument.documentElement.scrollHeight = 100;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: browserDocument });
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    const cursorA = 'db:00000000-0000-4000-8000-000000000001';
    const cursorB = 'db:00000000-0000-4000-8000-000000000002';
    const cursorC = 'db:00000000-0000-4000-8000-000000000003';

    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: timelineScreenWithPushContext('Home'),
        }),
      );
    });
    await respond(latest('HomePageQuery'), payload('homeTimeline', [], true, cursorA));
    assertConnection(environment, 'homeTimeline', [], true, cursorA);
    const firstNextPage = latest('PostListHomeNextPageQuery');
    assert.equal(firstNextPage.variables.cursor, cursorA);
    assert.equal(firstNextPage.variables.count, 20);

    await respond(firstNextPage, payload('homeTimeline', [], true, cursorB));
    assertConnection(environment, 'homeTimeline', [], true, cursorB);
    await act(async () => mock.timers.tick(0));
    const secondNextPage = latest('PostListHomeNextPageQuery');
    assert.notEqual(secondNextPage, firstNextPage);
    assert.equal(secondNextPage.variables.cursor, cursorB);
    assert.equal(secondNextPage.variables.count, 20);

    await respond(secondNextPage, payload('homeTimeline', ['visible'], false, cursorC));
    assertConnection(environment, 'homeTimeline', ['visible'], false, cursorC);
    await act(async () => mock.timers.tick(0));
    assert.equal(requests.length, 3, 'pagination stops when the visible page has no successor');
  });

  for (const timeline of ['Local', 'Federated'] as const) {
    it(`${timeline}: load-more continues from the Relay cursor after a page adds no visible posts`, async () => {
      const environment = new Environment({
        network: createTimelineNetwork(),
        store: new Store(new RecordSource()),
      });
      const cursorA = 'db:00000000-0000-4000-8000-000000000001';
      const cursorB = 'db:00000000-0000-4000-8000-000000000002';
      const cursorC = 'db:00000000-0000-4000-8000-000000000003';
      const field = timeline === 'Local' ? 'localTimeline' : 'federatedTimeline';
      const pageQuery = `${timeline}PageQuery`;
      const nextPageQuery = `PostList${timeline}NextPageQuery`;

      await act(async () => {
        renderer = create(
          createElement(ReactRelay.RelayEnvironmentProvider, {
            environment,
            children: timelineScreenWithPushContext(timeline),
          }),
        );
      });
      await respond(latest(pageQuery), payload(field, [], true, cursorA));
      assertConnection(environment, field, [], true, cursorA);

      const initialButton = loadMoreButton();
      await act(async () => initialButton.props.onPress());
      const firstNextPage = latest(nextPageQuery);
      assert.equal(firstNextPage.variables.cursor, cursorA);
      await respond(firstNextPage, payload(field, ['visible'], true, cursorB));
      assertConnection(environment, field, ['visible'], true, cursorB);

      await act(async () => list().props.onEndReached());
      const noGrowthPage = latest(nextPageQuery);
      assert.notEqual(noGrowthPage, firstNextPage);
      assert.equal(noGrowthPage.variables.cursor, cursorB);
      await respond(noGrowthPage, payload(field, [], true, cursorC));
      assertConnection(environment, field, ['visible'], true, cursorC);

      const moreButton = loadMoreButton();
      await act(async () => moreButton.props.onPress());
      const finalPage = latest(nextPageQuery);
      assert.equal(finalPage.variables.cursor, cursorC);
      await respond(finalPage, payload(field, ['next-visible'], false));
      assertConnection(environment, field, ['visible', 'next-visible'], false);

      assert.throws(loadMoreButton, 'terminal pagination removes the More action');
    });
  }

  for (const timeline of ['Home', 'Local'] as const) {
    for (const first of ['pagination', 'refresh'] as const) {
      it(`${timeline}: ${first} completes first without stale connection edges or cursor`, async () => {
        const environment = new Environment({
          network: createTimelineNetwork(),
          store: new Store(new RecordSource()),
        });
        const field = timeline === 'Home' ? 'homeTimeline' : 'localTimeline';
        const pageName = `PostList${timeline}NextPageQuery`;
        await act(async () => {
          renderer = create(
            createElement(ReactRelay.RelayEnvironmentProvider, {
              environment,
              children: timelineScreenWithPushContext(timeline),
            }),
          );
        });
        await respond(latest(`${timeline}PageQuery`), payload(field, ['a', 'b']));
        assertConnection(environment, field, ['a', 'b']);
        await act(async () => list().props.onEndReached());
        const pagination = latest(pageName);
        assert.equal(pagination.variables.cursor, 'cursor-b');
        await act(async () => list().props.onRefresh());
        const refresh = latest(timeline === 'Home' ? 'HomePageQuery' : 'LocalContentRefetchQuery');
        assert.equal(
          requests.length,
          3,
          'Initial, pagination and refresh requests must all execute',
        );
        assert.equal(list().props.refreshing, true);
        assertConnection(environment, field, ['a', 'b']);
        if (first === 'pagination') {
          await respond(pagination, payload(field, ['c', 'd'], false));
          assertConnection(environment, field, ['a', 'b', 'c', 'd'], false);
          await respond(refresh, payload(field, ['new', 'a']));
        } else {
          await respond(refresh, payload(field, ['new', 'a']));
          assertConnection(environment, field, ['new', 'a']);
          // Old cursor-b no longer matches the refreshed connection end cursor.
          await respond(pagination, payload(field, ['c', 'd'], false));
        }
        assert.equal(list().props.refreshing, false);
        assertConnection(environment, field, ['new', 'a']);
        await act(async () => list().props.onEndReached());
        const next = latest(pageName);
        assert.notEqual(next, pagination);
        assert.equal(next.variables.cursor, 'cursor-a');
        await respond(next, payload(field, ['b', 'c'], false));
        assertConnection(environment, field, ['new', 'a', 'b', 'c'], false);
      });
    }
  }
});

for (const timeline of ['Home', 'Local'] as const) {
  it(`${timeline}: parent updates preserve rows while Relay connection updates remain visible`, async () => {
    const environment = new Environment({
      network: createTimelineNetwork(),
      store: new Store(new RecordSource()),
    });
    const render = () =>
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: timelineScreenWithPushContext(timeline),
      });
    await act(async () => {
      renderer = create(render());
    });
    const field = timeline === 'Home' ? 'homeTimeline' : 'localTimeline';
    await respond(latest(`${timeline}PageQuery`), payload(field, ['a', 'b']));
    const before = rowRenders;
    await act(async () => renderer!.update(render()));
    assert.equal(rowRenders, before, 'unchanged rows must not render for a parent update');
    await act(async () => list().props.onEndReached());
    await respond(latest(`PostList${timeline}NextPageQuery`), payload(field, ['c'], false));
    assertConnection(environment, field, ['a', 'b', 'c'], false);
  });
}

function guestPayload(ids: string[], hasNextPage = true) {
  return { ...payload('localTimeline', ids, hasNextPage), currentSession: null, me: null };
}

async function renderLocal(status: 'guest' | 'valid' = 'guest') {
  platform.OS = 'web';
  sessionStatus = status;
  const environment = new Environment({
    network: createTimelineNetwork(),
    store: new Store(new RecordSource()),
  });
  await act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: createElement(
          LocalTimelineScreen,
          status === 'guest' ? { publicEntry: true } : {},
        ),
      }),
    );
  });
  return environment;
}

async function scrollGuestNearEnd() {
  await act(async () => {
    browserWindow.scrollY = 9500;
    browserListeners.get('scroll')?.();
  });
}

function visibleToast() {
  const toast = toasts.findLast((toast) => toast.visible);
  assert.ok(toast, 'Expected an actionable error toast');
  assert.ok(toast.options.action);
  return toast;
}

describe('Guest Local with real Relay', () => {
  it('loads and paginates public rows without a profile or protected timeline tabs', async () => {
    const environment = await renderLocal();
    assert.equal(
      renderer!.root.findAllByType('StateView' as never).some((node) => node.props.loading),
      true,
    );
    await respond(latest('LocalPageQuery'), guestPayload(['a', 'b']));
    assertConnection(environment, 'localTimeline', ['a', 'b']);
    assert.equal(renderer!.root.findAllByType(TimelineTabs).length, 0);
    assert.ok(loadMoreButton());

    await scrollGuestNearEnd();
    const next = latest('PostListLocalNextPageQuery');
    assert.equal(next.variables.cursor, 'cursor-b');
    assert.equal(next.variables.count, 20);
    await respond(next, guestPayload(['c'], false));
    assertConnection(environment, 'localTimeline', ['a', 'b', 'c'], false);
    assert.throws(loadMoreButton, 'terminal pagination removes the More action');
    const requestCount = requests.length;
    await scrollGuestNearEnd();
    assert.equal(requests.length, requestCount);
  });

  it('preserves rows and the cursor after pagination failure, then retries the same page', async () => {
    const environment = await renderLocal();
    await respond(latest('LocalPageQuery'), guestPayload(['a', 'b']));
    await scrollGuestNearEnd();
    const failedPage = latest('PostListLocalNextPageQuery');
    await act(async () => failedPage.sink.error(new Error('pagination failed')));
    assertConnection(environment, 'localTimeline', ['a', 'b']);
    const toast = visibleToast();
    await scrollGuestNearEnd();
    assert.equal(
      latest('PostListLocalNextPageQuery'),
      failedPage,
      'Scroll must not retry a failed page automatically',
    );
    await act(async () => toast.options.action!.onPress());
    const retry = latest('PostListLocalNextPageQuery');
    assert.notEqual(retry, failedPage);
    assert.equal(retry.variables.cursor, 'cursor-b');
    await respond(retry, guestPayload(['c'], false));
    assertConnection(environment, 'localTimeline', ['a', 'b', 'c'], false);
    assert.equal(toast.visible, false);
  });

  it('retries an initial error through the route boundary and renders an empty result', async () => {
    await renderLocal();
    const failed = latest('LocalPageQuery');
    await act(async () => failed.sink.error(new Error('initial request failed')));
    const toast = visibleToast();
    assert.equal(toast.options.persistent, true);
    assert.equal(renderer!.root.findAllByType('PostRow' as never).length, 0);
    await act(async () => toast.options.action!.onPress());
    const retry = latest('LocalPageQuery');
    assert.notEqual(retry, failed);
    await respond(retry, guestPayload([], false));
    assert.equal(
      renderer!.root
        .findAllByType('StateView' as never)
        .some((node) => !node.props.loading && !node.props.alert),
      true,
    );
    assert.equal(renderer!.root.findAllByType('Button' as never).length, 0);
    assert.equal(toast.visible, false);
  });

  it('keeps valid sessions without a selected profile in profile preparation', async () => {
    await renderLocal('valid');
    const data = payload('localTimeline', ['a'], false);
    await respond(latest('LocalPageQuery'), {
      ...data,
      currentSession: { id: 'session', selectedProfile: null },
    });
    assert.equal(renderer!.root.findAllByType('PostRow' as never).length, 0);
    const action = renderer!.root.findByType('Button' as never);
    await act(async () => action.props.onPress());
    assert.equal(openProfileSwitcher.mock.callCount(), 1);
  });
});

for (const os of ['web', 'ios', 'android']) {
  for (const timeline of ['Home', 'Local'] as const) {
    it(`${os} ${timeline}: 상단 탭 재선택은 목록을 유지하며 refresh하고 pending 입력은 합친다`, async () => {
      platform.OS = os;
      const environment = new Environment({
        network: createTimelineNetwork(),
        store: new Store(new RecordSource()),
      });
      let offset = 480;
      await act(async () => {
        renderer = create(
          createElement(ReactRelay.RelayEnvironmentProvider, {
            environment,
            children: timelineScreenWithPushContext(timeline),
          }),
          {
            createNodeMock: ({ type }) =>
              type === 'FlatList'
                ? {
                    scrollToOffset: (options: { animated: boolean; offset: number }) => {
                      assert.deepEqual(options, { animated: true, offset: 0 });
                      offset = options.offset;
                    },
                  }
                : null,
          },
        );
      });
      const field = timeline === 'Home' ? 'homeTimeline' : 'localTimeline';
      await respond(latest(`${timeline}PageQuery`), payload(field, ['a', 'b']));
      const tab = () =>
        renderer!.root.find(
          (node) =>
            (node.type as unknown) === 'Pressable' &&
            node.props.accessibilityLabel === (timeline === 'Home' ? '홈' : '로컬'),
        );
      const initialRequests = requests.length;

      const reselect = async () => {
        const scrollCallsBefore = browserScrollCalls.length;
        offset = 640;
        await act(async () => tab().props.onPress());
        if (os === 'web') {
          assert.ok(browserScrollCalls.length > scrollCallsBefore);
        } else {
          assert.equal(offset, 0);
        }
        assert.deepEqual(navigations, []);
        assert.equal(tab().props.accessibilityState.selected, true);
      };
      await reselect();
      const firstRefresh = latest(
        timeline === 'Home' ? 'HomePageQuery' : 'LocalContentRefetchQuery',
      );
      assert.equal(requests.length, initialRequests + 1);
      assertConnection(environment, field, ['a', 'b']);
      assert.equal(
        renderer!.root.findAllByType('StateView' as never).some((node) => node.props.loading),
        false,
      );

      for (let repeat = 0; repeat < 2; repeat += 1) {
        await reselect();
        assert.equal(requests.length, initialRequests + 1);
        if (os !== 'web') {
          assert.equal(list().props.refreshing, true);
        }
        assertConnection(environment, field, ['a', 'b']);
      }
      await respond(firstRefresh, payload(field, ['new', 'a']));
      if (os !== 'web') {
        assert.equal(list().props.refreshing, false);
      }
      assertConnection(environment, field, ['new', 'a']);

      await reselect();
      const secondRefresh = latest(
        timeline === 'Home' ? 'HomePageQuery' : 'LocalContentRefetchQuery',
      );
      assert.notEqual(secondRefresh, firstRefresh);
      assert.equal(requests.length, initialRequests + 2);
      assertConnection(environment, field, ['new', 'a']);
      await respond(secondRefresh, payload(field, ['latest', 'new']));
      assertConnection(environment, field, ['latest', 'new']);

      if (os !== 'web') {
        await act(async () => list().props.onEndReached());
        const next = latest(`PostList${timeline}NextPageQuery`);
        assert.equal(next.variables.cursor, 'cursor-new');
        await respond(next, payload(field, ['b'], false));
        assertConnection(environment, field, ['latest', 'new', 'b'], false);
      }
    });
  }
}
