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
  Platform: { OS: 'ios' },
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
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => null });
mockModule('@/components/shell/shellLayout', {
  getShellLayout: () => 'mobile',
  getWebMobileShellHeaderStickyOffset: () => 0,
});
mockModule('@/components/TimelineTabs', { TimelineTabs: () => null });
mockModule('@/components/ui/Button', { Button: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111', textSecondary: '#777' }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  space: { 8: 8, 16: 16 },
  spacing: { lg: 16, sm: 8, xl: 24 },
  typography: { md: {}, sm: {} },
});

// Mock unrelated row UI/providers, retaining PostList, InfiniteList and loadNext behavior.
for (const name of ['PostActionAuthentication', 'PostComposerCoordinator', 'PostMediaViewerHost']) {
  mockModule(new URL(`../post/${name}.tsx`, import.meta.url), {
    [`${name}Provider`]: ({ children }: { children: ReactNode }) => children,
  });
}
mockModule(new URL('../post/PostListItem.tsx', import.meta.url), {
  PostListItem: ({ post }: { post: { __id: string } }) =>
    createElement('PostRow', { id: post.__id }),
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
});

const profile = {
  id: 'profile-a',
  displayName: 'Author',
  handle: 'author',
  relativeHandle: '@author',
  avatar: null,
  private: { defaultPostVisibility: 'PUBLIC' },
  viewerState: { profileMute: null },
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
