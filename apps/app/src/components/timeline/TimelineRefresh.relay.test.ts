import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Fragment, Suspense } from 'react';
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
let LocalTimelineScreen: ComponentType;
type Request = {
  name: string;
  variables: Variables;
  sink: { next(value: GraphQLResponse): void; complete(): void };
};
const requests: Request[] = [];
const showToast = () => () => undefined;
const platform = { OS: 'ios' };
const navigations: unknown[] = [];
const tabRegistry = createTabReselectionRegistry();
const shellChrome = {
  registerHomeReselection: () => () => undefined,
  registerTabReselection: tabRegistry.register,
  reselectTab: tabRegistry.reselect,
};
class AnimatedValueMock {
  constructor(public value: number) {}
  setValue(value: number) {
    this.value = value;
  }
  stopAnimation() {}
}
mockModule('expo-router', {
  useRouter: () => ({
    replace: (href: string) => navigations.push(href),
    setParams: (params: object) => navigations.push(params),
  }),
});

// Only resolve graphql tags to compiler artifacts; all Relay hooks and normalization are real.
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment) (\w+)/)?.[1];
    assert.ok(name);
    return require(
      `${name.startsWith('PostList') ? '../post' : '.'}/__generated__/${name}.graphql.ts`,
    ).default;
  },
});
mockModule('lucide-react-native', { UserRoundPlus: 'UserRoundPlus' });
mockModule(require.resolve('lucide-react-native'), { UserRoundPlus: 'UserRoundPlus' });
mockModule('react-native', {
  Platform: platform,
  Animated: {
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

mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'actor',
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children: ReactNode }) =>
    createElement(Suspense, { fallback: null }, children),
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => shellChrome });
mockModule('@/components/shell/shellLayout', {
  getShellLayout: () => 'mobile',
  getWebMobileShellHeaderStickyOffset: () => 0,
});
mockModule('@/components/ui/Button', { Button: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111', textSecondary: '#777' }),
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
  ({ default: HomeTimelineScreen } = await import('./HomeTimelineScreen'));
  ({ default: LocalTimelineScreen } = await import('./LocalTimelineScreen'));
});
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
  navigations.length = 0;
  platform.OS = 'ios';
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
              children: createElement(
                timeline === 'Home' ? HomeTimelineScreen : LocalTimelineScreen,
              ),
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
        children: createElement(timeline === 'Home' ? HomeTimelineScreen : LocalTimelineScreen),
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
            children: createElement(timeline === 'Home' ? HomeTimelineScreen : LocalTimelineScreen),
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
