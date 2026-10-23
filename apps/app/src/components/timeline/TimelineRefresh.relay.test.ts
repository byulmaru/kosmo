import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Fragment } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  ConnectionHandler,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import { WebPushPermissionContext } from '@/components/native-push/webPushPermissionContext';
import { colors } from '@/theme/tokens';
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
let TimelineTabs: ComponentType<{ value: 'home' | 'local' }>;
let LocalTimelineScreen: ComponentType<{ publicEntry?: boolean }>;
const platform = { OS: 'ios' };
let sessionStatus: 'error' | 'guest' | 'valid' = 'valid';
const openProfileSwitcher = mock.fn();
const browserListeners = new Map<string, () => void>();
const browserWindow = {
  scrollY: 0,
  innerHeight: 600,
  addEventListener: (type: string, listener: () => void) => browserListeners.set(type, listener),
  removeEventListener: (type: string) => browserListeners.delete(type),
  requestAnimationFrame: (callback: () => void) => {
    callback();
    return 1;
  },
  cancelAnimationFrame: () => undefined,
};
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
type Request = {
  name: string;
  variables: Variables;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
};
const requests: Request[] = [];
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
const shellChrome = {
  openProfileSwitcher,
  registerHomeReselection: () => () => undefined,
  registerTabReselection: tabRegistry.register,
  reselectTab: tabRegistry.reselect,
};

function timelineScreenWithPushContext(timeline: 'Home' | 'Local') {
  const screen = createElement(timeline === 'Home' ? HomeTimelineScreen : LocalTimelineScreen);
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
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(
      `${name.startsWith('PostList') || name.startsWith('ProfilePinOrder') ? '../post' : '.'}/__generated__/${name}.graphql.ts`,
    ).default;
  },
});
mockModule('expo-router', {
  useRouter: () => ({
    replace: (href: string) => navigations.push(href),
    setParams: (params: object) => navigations.push(params),
  }),
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
    renderItem: (value: object) => ReactNode;
  }) =>
    createElement(
      'FlatList',
      props,
      props.data.map((item, index) =>
        createElement(
          Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ item, index }),
        ),
      ),
    ),
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 390 }),
  View: 'View',
});
mockModule('@/components/PageHeader', { PageHeader: () => null });
mockModule('@/components/coachmark/TimelineCoachmark', {
  TimelineCoachmark: () => null,
  TimelineHelpButton: () => null,
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
  getTimelineGuideViewportWidth: (_web: boolean, width: number) => width,
  getWebMobileShellHeaderStickyOffset: () => 0,
});
mockModule('@/components/ui/Button', { Button: (props: object) => createElement('Button', props) });
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
});
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: { scrollHeight: 10000 } },
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
  toasts.length = 0;
  platform.OS = 'ios';
  sessionStatus = 'valid';
  browserWindow.scrollY = 0;
  browserListeners.clear();
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
  private: { defaultPostVisibility: 'PUBLIC' },
  viewerState: { profileBlock: null, profileMute: null },
};
function payload(field: string, ids: string[], hasNextPage = true) {
  return {
    currentSession: { id: 'session', selectedProfile: profile },
    me: {
      id: 'account',
      name: 'Author',
      profiles: [{ id: profile.id }],
      seenCoachmarks: [],
    },
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
            document: null,
            media: [],
            mentionedProfiles: [],
          },
          replyParent: null,
          repostSource: null,
          visibility: 'PUBLIC',
          state: 'ACTIVE',
          viewerBookmark: null,
          viewerRepost: null,
          viewerReactions: [],
          reactionCounts: [],
          repostCount: 0,
        },
      })),
      pageInfo: { endCursor: `cursor-${ids.at(-1)}`, hasNextPage },
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
function list() {
  assert.ok(renderer);
  return renderer.root.find((node) => (node.type as unknown) === 'FlatList');
}
function assertConnection(
  environment: Environment,
  field: string,
  ids: string[],
  hasNextPage = true,
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
    ids.map((id) => `cursor-${id}`),
  );
  const pageInfo = source.get((connection.pageInfo as { __ref: string }).__ref);
  assert.equal(pageInfo?.endCursor, `cursor-${ids.at(-1)}`);
  assert.equal(pageInfo?.hasNextPage, hasNextPage);
}

describe('Timeline refresh and pagination with real Relay', () => {
  for (const timeline of ['Home', 'Local'] as const) {
    for (const first of ['pagination', 'refresh'] as const) {
      it(`${timeline}: ${first} completes first without stale connection edges or cursor`, async () => {
        const environment = new Environment({
          network: Network.create((operation, variables) =>
            Observable.create<GraphQLResponse>((sink) => {
              requests.push({ name: operation.name, variables, sink });
            }),
          ),
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
      network: Network.create((operation, variables) =>
        Observable.create<GraphQLResponse>((sink) => {
          requests.push({ name: operation.name, variables, sink });
        }),
      ),
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
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, variables, sink });
      }),
    ),
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
    assert.equal(renderer!.root.findAllByType('Button' as never).length, 0);

    await scrollGuestNearEnd();
    const next = latest('PostListLocalNextPageQuery');
    assert.equal(next.variables.cursor, 'cursor-b');
    assert.equal(next.variables.count, 20);
    await respond(next, guestPayload(['c'], false));
    assertConnection(environment, 'localTimeline', ['a', 'b', 'c'], false);
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

for (const os of ['ios', 'android']) {
  for (const timeline of ['Home', 'Local'] as const) {
    it(`${os} ${timeline}: 실제 상단 탭 재선택은 새로고침 중에도 스크롤만 한다`, async () => {
      platform.OS = os;
      const environment = new Environment({
        network: Network.create((operation, variables) =>
          Observable.create<GraphQLResponse>((sink) => {
            requests.push({ name: operation.name, variables, sink });
          }),
        ),
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
      for (let repeat = 0; repeat < 2; repeat += 1) {
        offset = 480;
        await act(async () => tab().props.onPress());
        assert.equal(offset, 0);
        assert.equal(requests.length, initialRequests);
        assert.deepEqual(navigations, []);
        assert.equal(tab().props.accessibilityState.selected, true);
      }
      assertConnection(environment, field, ['a', 'b']);

      await act(async () => list().props.onRefresh());
      const refresh = latest(timeline === 'Home' ? 'HomePageQuery' : 'LocalContentRefetchQuery');
      assert.equal(requests.length, initialRequests + 1);
      for (let repeat = 0; repeat < 2; repeat += 1) {
        offset = 640;
        await act(async () => tab().props.onPress());
        assert.equal(offset, 0);
        assert.equal(requests.length, initialRequests + 1);
        assert.equal(list().props.refreshing, true);
        assert.deepEqual(navigations, []);
      }
      await respond(refresh, payload(field, ['new', 'a']));
      assert.equal(list().props.refreshing, false);
      assertConnection(environment, field, ['new', 'a']);
      await act(async () => list().props.onEndReached());
      const next = latest(`PostList${timeline}NextPageQuery`);
      assert.equal(next.variables.cursor, 'cursor-a');
      await respond(next, payload(field, ['b'], false));
      assertConnection(environment, field, ['new', 'a', 'b'], false);
    });
  }
}
