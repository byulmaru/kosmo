import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { UseAutomaticPaginationResult } from '../pagination/useAutomaticPagination';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryMode = 'error' | 'loading' | 'success';
type QueryName = 'ProfileLayoutQuery' | 'ProfilePostListPageQuery';

const queryModes: Record<QueryName, QueryMode> = {
  ProfileLayoutQuery: 'success',
  ProfilePostListPageQuery: 'success',
};
const queryHistory: Array<{
  fetchKey: number;
  handle: string;
  query: QueryName;
}> = [];
const pending = new Promise<never>(() => undefined);

type RouteParams = { profileHandle?: string | string[] };
type NativeScrollProps = UseAutomaticPaginationResult['nativeScrollProps'];

const LocalParamsContext = createContext<RouteParams>({});
const platform: { OS: 'web' | 'ios' } = { OS: 'web' };

let globalParams: RouteParams = {};
let layoutLocalParams: RouteParams = {};
let screenLocalParams: RouteParams = {};
let pathname = '/profile/';
let renderer: ReactTestRenderer | null = null;
let SlotContent: ComponentType | null = null;
let profileAvailable = true;
let profileInstanceKind: 'ACTIVITYPUB' | 'LOCAL' = 'LOCAL';
let routeProbeEnabled = false;
let routerBackCount = 0;
let usePaginationScrollRegistration: (props: NativeScrollProps | null) => void = () => undefined;
let routeMetrics = {
  contentHeight: 0,
  layoutHeight: 0,
  scrollOffset: 0,
};
let profileViewerState: {
  isSelf: boolean;
  membership: { role: 'MEMBER' | 'OWNER' } | null;
} | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const routePaginationHandlers: NativeScrollProps = {
  onContentSizeChange: (_width, height) => {
    routeMetrics.contentHeight = height;
  },
  onLayout: (event) => {
    routeMetrics.layoutHeight = event.nativeEvent.layout.height;
  },
  onScroll: (event) => {
    routeMetrics.contentHeight = event.nativeEvent.contentSize.height;
    routeMetrics.layoutHeight = event.nativeEvent.layoutMeasurement.height;
    routeMetrics.scrollOffset = event.nativeEvent.contentOffset.y;
  },
  scrollEventThrottle: 16,
};

function RoutePaginationProbe({ children }: { children: ReactNode }) {
  usePaginationScrollRegistration(routePaginationHandlers);
  return children;
}

mockModule('expo-router', {
  Slot: () =>
    SlotContent
      ? createElement(
          LocalParamsContext.Provider,
          { value: screenLocalParams },
          createElement(SlotContent),
        )
      : null,
  useGlobalSearchParams: () => globalParams,
  useLocalSearchParams: () => useContext(LocalParamsContext),
  usePathname: () => pathname,
  useRouter: () => ({ back: () => (routerBackCount += 1) }),
});
mockModule('lucide-react-native', {
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), {
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: Record<string, unknown>) => createElement('PageHeader', props),
});
mockModule(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  NavigationLink: ({
    children,
    href,
  }: {
    children: ReturnType<typeof createElement>;
    href: string;
  }) => createElement('NavigationLink', { href }, children),
});
mockModule('react-native', {
  Platform: platform,
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    const query = parts.join('').match(/query (ProfileLayoutQuery|ProfilePostListPageQuery)/)?.[1];
    assert.ok(query);
    return query as QueryName;
  },
  useLazyLoadQuery: (
    query: QueryName,
    variables: { handle: string },
    options: { fetchKey: number },
  ) => {
    queryHistory.push({ fetchKey: options.fetchKey, handle: variables.handle, query });
    const mode = queryModes[query];
    if (mode === 'loading') {
      throw pending;
    }
    if (mode === 'error') {
      throw new Error(`${query}:${variables.handle}`);
    }

    return {
      profileByHandle: profileAvailable
        ? {
            displayName: `Display ${variables.handle}`,
            handle: variables.handle,
            id: `profile:${variables.handle}`,
            instance: { kind: profileInstanceKind },
            viewerState: profileViewerState,
          }
        : null,
    };
  },
});
mockModule(new URL('./ProfileHero.tsx', import.meta.url), {
  ProfileHero: ({
    action,
    heading,
    loading,
    profile,
  }: {
    action?: ReturnType<typeof createElement>;
    heading?: boolean;
    loading?: boolean;
    profile?: { handle: string };
  }) =>
    createElement(
      'ProfileHero',
      { heading, identity: loading ? 'loading' : profile?.handle },
      action,
    ),
});
mockModule(new URL('./FollowButton.tsx', import.meta.url), {
  FollowButton: ({ profile }: { profile: { handle: string } }) =>
    createElement('FollowButton', { identity: profile.handle }),
});
mockModule(new URL('./ProfileMuteAction.tsx', import.meta.url), {
  ProfileMuteAction: 'ProfileMuteAction',
});
mockModule(new URL('./ProfileMuteController.tsx', import.meta.url), {
  useProfileMuteMutations: () => ({ changeMuted: () => Promise.resolve() }),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children: string }) =>
    createElement('Button', props, children),
});
mockModule(new URL('../ui/IconButton.tsx', import.meta.url), {
  IconButton: ({ children, ...props }: { children: ReactNode }) =>
    createElement('IconButton', props, children),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ foregroundPrimary: '#111111' }),
});
mockModule(new URL('../post/PostList.tsx', import.meta.url), {
  PostList: ({
    error,
    loading,
    onRetry,
    profile,
  }: {
    error?: boolean;
    loading?: boolean;
    onRetry?: () => void;
    profile?: { handle: string };
  }) => {
    const postList = createElement('PostList', {
      identity: error ? 'error' : loading ? 'loading' : profile?.handle,
      onRetry,
    });
    return routeProbeEnabled ? createElement(RoutePaginationProbe, null, postList) : postList;
  },
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => 'actor-a',
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId: 'profile:viewer' }),
});

let ProfileLayout: ComponentType;
let ProfilePostListPage: ComponentType;

before(async () => {
  ({ usePaginationScrollRegistration } = await import('../pagination/PaginationScrollView'));
  ({ default: ProfileLayout } = await import('../../app/(tabs)/(profile)/[profileHandle]/_layout'));
  ({ default: ProfilePostListPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/index'));
  SlotContent = ProfilePostListPage;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  globalParams = {};
  layoutLocalParams = {};
  screenLocalParams = {};
  pathname = '/profile/';
  platform.OS = 'web';
  routeProbeEnabled = false;
  routerBackCount = 0;
  routeMetrics = { contentHeight: 0, layoutHeight: 0, scrollOffset: 0 };
  queryModes.ProfileLayoutQuery = 'success';
  queryModes.ProfilePostListPageQuery = 'success';
  queryHistory.length = 0;
  profileAvailable = true;
  profileInstanceKind = 'LOCAL';
  profileViewerState = null;
});

async function renderRoute(profileHandle: string, routePath = `/profile/${profileHandle}`) {
  globalParams = { profileHandle };
  screenLocalParams = { profileHandle };
  pathname = routePath;
  if (!renderer) {
    layoutLocalParams = { profileHandle };
  }
  await act(async () => {
    if (renderer) {
      renderer.update(
        createElement(
          LocalParamsContext.Provider,
          { value: layoutLocalParams },
          createElement(ProfileLayout),
        ),
      );
    } else {
      renderer = create(
        createElement(
          LocalParamsContext.Provider,
          { value: layoutLocalParams },
          createElement(ProfileLayout),
        ),
      );
    }
  });
  assert.ok(renderer);
}

function identities(type: string) {
  return rendered(type).map((node) => node.props.identity as string);
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function requireRendered(type: string) {
  const node = rendered(type)[0];
  assert.ok(node);
  return node;
}

describe('profile route parameter lifecycle', () => {
  it('canonical Profile Home places the full display name header before the existing content', async () => {
    await renderRoute('@local', '/@local');

    const header = requireRendered('PageHeader');
    assert.equal(header.props.title, 'Display local');
    assert.equal(header.props.titleLines, 1);
    const hero = requireRendered('ProfileHero');
    assert.equal(hero.props.heading, false);
    assert.equal(rendered('ProfileHero').length, 1);
    assert.equal(rendered('PostList').length, 1);
    assert.equal(rendered('StateView').length, 0);
    const route = renderer?.toJSON();
    assert.ok(route && !Array.isArray(route));
    assert.deepEqual(
      route.children?.map((child) => (typeof child === 'string' ? child : child.type)),
      ['PageHeader', 'ProfileHero', 'PostList'],
    );

    const leading = header.props.leading;
    assert.ok(leading);
    assert.equal(leading?.props.accessibilityLabel, '뒤로 가기');
    await act(async () => leading?.props.onPress());
    assert.equal(routerBackCount, 1);
  });

  it('canonical missing Profile Home keeps route chrome with only the missing state', async () => {
    profileAvailable = false;
    await renderRoute('@missing', '/@missing');

    assert.equal(requireRendered('PageHeader').props.title, '');
    assert.equal(requireRendered('StateView').props.title, '프로필을 찾을 수 없어요');
    assert.equal(rendered('ProfileHero').length, 0);
    assert.equal(rendered('PostList').length, 0);
    const route = renderer?.toJSON();
    assert.ok(route && !Array.isArray(route));
    assert.deepEqual(
      route.children?.map((child) => (typeof child === 'string' ? child : child.type)),
      ['PageHeader', 'StateView'],
    );

    const leading = requireRendered('PageHeader').props.leading;
    assert.ok(leading);
    await act(async () => leading.props.onPress());
    assert.equal(routerBackCount, 1);
  });

  it('keeps the shared Profile layout header out of nested relationship routes', async () => {
    for (const relation of ['followers', 'following']) {
      await renderRoute('@local', `/@local/${relation}`);

      assert.equal(rendered('PageHeader').length, 0);
      assert.equal(requireRendered('ProfileHero').props.heading, true);
      assert.equal(rendered('ProfileHero').length, 1);
      assert.equal(rendered('PostList').length, 1);
    }
  });

  it('표시 중인 selected Local Owner Profile에만 편집 Link를 노출한다', async () => {
    profileViewerState = { isSelf: true, membership: { role: 'OWNER' } };
    await renderRoute('@local');

    assert.deepEqual(
      rendered('NavigationLink').map((node) => node.props.href),
      ['/profile-edit'],
    );
    assert.deepEqual(identities('FollowButton'), []);

    profileViewerState = { isSelf: true, membership: { role: 'MEMBER' } };
    await renderRoute('@local');
    assert.deepEqual(rendered('NavigationLink'), []);
    assert.deepEqual(identities('FollowButton'), ['local']);

    profileViewerState = { isSelf: false, membership: { role: 'OWNER' } };
    await renderRoute('@local');
    assert.deepEqual(rendered('NavigationLink'), []);
    assert.deepEqual(identities('FollowButton'), ['local']);

    profileViewerState = { isSelf: true, membership: { role: 'OWNER' } };
    profileInstanceKind = 'ACTIVITYPUB';
    await renderRoute('@remote@activitypub.example');
    assert.deepEqual(rendered('NavigationLink'), []);
    assert.deepEqual(identities('FollowButton'), ['remote@activitypub.example']);

    profileViewerState = null;
    profileInstanceKind = 'LOCAL';
    await renderRoute('@local');
    assert.deepEqual(rendered('NavigationLink'), []);
    assert.deepEqual(identities('FollowButton'), ['local']);

    profileAvailable = false;
    await renderRoute('@inactive');
    assert.deepEqual(rendered('NavigationLink'), []);
    assert.deepEqual(identities('FollowButton'), []);
    assert.equal(requireRendered('StateView').props.title, '프로필을 찾을 수 없어요');
  });

  it('local → remote → local 뒤로 가기에서 header, action, nested list를 같은 identity로 전환한다', async () => {
    await renderRoute('@local');
    assert.deepEqual(identities('ProfileHero'), ['local']);
    assert.deepEqual(identities('FollowButton'), ['local']);
    assert.deepEqual(identities('PostList'), ['local']);

    await renderRoute('@remote@activitypub.example');
    assert.deepEqual(identities('ProfileHero'), ['remote@activitypub.example']);
    assert.deepEqual(identities('FollowButton'), ['remote@activitypub.example']);
    assert.deepEqual(identities('PostList'), ['remote@activitypub.example']);

    await renderRoute('@local');
    assert.deepEqual(identities('ProfileHero'), ['local']);
    assert.deepEqual(identities('FollowButton'), ['local']);
    assert.deepEqual(identities('PostList'), ['local']);
  });

  it('native layout은 같은 handle의 pathname 전환에서 이전 scroll metric을 재생하지 않는다', async () => {
    platform.OS = 'ios';
    routeProbeEnabled = true;

    await renderRoute('@local', '/profile/@local');
    let scrollViews = rendered('ScrollView');
    assert.equal(scrollViews.length, 1);
    const firstScrollView = scrollViews[0];
    assert.ok(firstScrollView);
    assert.equal(
      firstScrollView.findAll((node) => (node.type as unknown) === 'ProfileHero').length,
      1,
    );
    assert.equal(
      firstScrollView.findAll((node) => (node.type as unknown) === 'PostList').length,
      1,
    );

    firstScrollView.props.onScroll({
      nativeEvent: {
        contentOffset: { y: 240 },
        contentSize: { height: 480 },
        layoutMeasurement: { height: 240 },
      },
    });
    assert.deepEqual(routeMetrics, { contentHeight: 480, layoutHeight: 240, scrollOffset: 240 });

    routeMetrics = { contentHeight: 0, layoutHeight: 0, scrollOffset: 0 };
    await renderRoute('@local', '/profile/@local/followers');

    scrollViews = rendered('ScrollView');
    assert.equal(scrollViews.length, 1);
    assert.notEqual(scrollViews[0], firstScrollView);
    assert.equal(
      scrollViews[0]?.findAll((node) => (node.type as unknown) === 'ProfileHero').length,
      1,
    );
    assert.equal(
      scrollViews[0]?.findAll((node) => (node.type as unknown) === 'PostList').length,
      1,
    );
    assert.deepEqual(routeMetrics, { contentHeight: 0, layoutHeight: 0, scrollOffset: 0 });

    scrollViews[0]?.props.onScroll({
      nativeEvent: {
        contentOffset: { y: 24 },
        contentSize: { height: 960 },
        layoutMeasurement: { height: 320 },
      },
    });
    assert.deepEqual(routeMetrics, { contentHeight: 960, layoutHeight: 320, scrollOffset: 24 });
  });

  it('handle 전환 중 layout과 nested query의 기존 loading fallback을 유지한다', async () => {
    await renderRoute('@local');

    queryModes.ProfileLayoutQuery = 'loading';
    await renderRoute('@remote@activitypub.example', '/@remote@activitypub.example');
    assert.equal(requireRendered('PageHeader').props.title, '');
    assert.deepEqual(identities('ProfileHero'), ['loading']);
    assert.deepEqual(identities('PostList'), []);
    const loadingRoute = renderer?.toJSON();
    assert.ok(loadingRoute && !Array.isArray(loadingRoute));
    assert.deepEqual(
      loadingRoute.children?.map((child) => (typeof child === 'string' ? child : child.type)),
      ['PageHeader', 'ProfileHero'],
    );

    const loadingLeading = requireRendered('PageHeader').props.leading;
    assert.ok(loadingLeading);
    await act(async () => loadingLeading.props.onPress());
    assert.equal(routerBackCount, 1);

    queryModes.ProfileLayoutQuery = 'success';
    queryModes.ProfilePostListPageQuery = 'loading';
    await renderRoute('@remote@activitypub.example', '/@remote@activitypub.example');
    assert.equal(requireRendered('PageHeader').props.title, 'Display remote@activitypub.example');
    assert.deepEqual(identities('ProfileHero'), ['remote@activitypub.example']);
    assert.deepEqual(identities('PostList'), ['loading']);
  });

  it('현재 handle의 layout error를 표시하고 retry에서 같은 query를 다시 실행한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryModes.ProfileLayoutQuery = 'error';
      await renderRoute('@remote@activitypub.example', '/@remote@activitypub.example');
      assert.equal(requireRendered('PageHeader').props.title, '');
      assert.equal(requireRendered('StateView').props.title, '프로필을 불러오지 못했어요');
      assert.equal(requireRendered('StateView').props.actionLabel, '다시 시도');
      assert.equal(requireRendered('StateView').props.alert, true);
      assert.equal(requireRendered('StateView').props.description, '잠시 후 다시 시도해주세요.');
      const errorRoute = renderer?.toJSON();
      assert.ok(errorRoute && !Array.isArray(errorRoute));
      assert.deepEqual(
        errorRoute.children?.map((child) => (typeof child === 'string' ? child : child.type)),
        ['PageHeader', 'StateView'],
      );

      const errorLeading = requireRendered('PageHeader').props.leading;
      assert.ok(errorLeading);
      await act(async () => errorLeading.props.onPress());
      assert.equal(routerBackCount, 1);

      queryModes.ProfileLayoutQuery = 'success';
      await act(async () => requireRendered('StateView').props.onAction());

      assert.deepEqual(identities('ProfileHero'), ['remote@activitypub.example']);
      const latestLayoutQuery = queryHistory.findLast(
        ({ query }) => query === 'ProfileLayoutQuery',
      );
      assert.equal(latestLayoutQuery?.handle, 'remote@activitypub.example');
      assert.equal(latestLayoutQuery?.fetchKey, 1);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('현재 handle의 nested error와 retry 동작을 유지한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryModes.ProfilePostListPageQuery = 'error';
      await renderRoute('@local');
      assert.deepEqual(identities('ProfileHero'), ['local']);
      assert.deepEqual(identities('PostList'), ['error']);

      queryModes.ProfilePostListPageQuery = 'success';
      const errorPostList = rendered('PostList').find((node) => node.props.identity === 'error');
      assert.ok(errorPostList);
      await act(async () => errorPostList.props.onRetry());

      assert.deepEqual(identities('PostList'), ['local']);
      const latestPostQuery = queryHistory.findLast(
        ({ query }) => query === 'ProfilePostListPageQuery',
      );
      assert.equal(latestPostQuery?.handle, 'local');
      assert.equal(latestPostQuery?.fetchKey, 1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
