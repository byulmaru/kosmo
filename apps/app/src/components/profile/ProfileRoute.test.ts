import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode, Ref } from 'react';
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
  withProfileBlockStatus?: boolean;
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
let relayActorLifecycleKey = 'actor-a';
let selectedProfileId: string | null = null;
let selectedProfileKind: 'ACTIVITYPUB' | 'LOCAL' | null = null;
let profileBlockStatus: { blockedBy: boolean; blocking: boolean; profileBlockId: string | null } = {
  blockedBy: false,
  blocking: false,
  profileBlockId: null,
};
let profileViewerState: {
  isSelf: boolean;
  membership: { role: 'MEMBER' | 'OWNER' } | null;
} | null = null;
const changeBlockedCalls: Array<{ change: object; nextBlocked: boolean }> = [];
const toastCalls: Array<{ message: string; tone: string }> = [];
const menuTriggerFocus = mock.fn();
const stateActionFocus = mock.fn();
const contentStateFocus = mock.fn();
let changeBlockedImpl: (change: object, nextBlocked: boolean) => Promise<void> = async () =>
  undefined;

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
  Ban: 'Ban',
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), {
  Ban: 'Ban',
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
    variables: { handle: string; withProfileBlockStatus?: boolean },
    options: { fetchKey: number },
  ) => {
    queryHistory.push({
      fetchKey: options.fetchKey,
      handle: variables.handle,
      query,
      withProfileBlockStatus:
        'withProfileBlockStatus' in variables ? variables.withProfileBlockStatus : undefined,
    });
    if (
      query === 'ProfileLayoutQuery' &&
      (!selectedProfileId || selectedProfileKind !== 'LOCAL') &&
      variables.withProfileBlockStatus !== false
    ) {
      throw new Error('profileBlockStatus requires a selected Local Profile');
    }
    const mode = queryModes[query];
    if (mode === 'loading') {
      throw pending;
    }
    if (mode === 'error') {
      throw new Error(`${query}:${variables.handle}`);
    }

    return {
      currentSession: selectedProfileId
        ? { selectedProfile: { id: selectedProfileId } }
        : { selectedProfile: null },
      profileBlockStatus: variables.withProfileBlockStatus === false ? null : profileBlockStatus,
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
    menuItems,
    onMenuTriggerReady,
    profile,
    showMuteAction,
  }: {
    action?: ReturnType<typeof createElement>;
    heading?: boolean;
    loading?: boolean;
    menuItems?: readonly object[];
    onMenuTriggerReady?: (focusTrigger: () => void) => void;
    profile?: { handle: string };
    showMuteAction?: boolean;
  }) => {
    onMenuTriggerReady?.(() => menuTriggerFocus());
    return createElement(
      'ProfileHero',
      { heading, identity: loading ? 'loading' : profile?.handle, showMuteAction },
      menuItems ? createElement('ActionMenu', { items: menuItems }) : null,
      action,
    );
  },
});
mockModule(new URL('./FollowButton.tsx', import.meta.url), {
  FollowButton: ({
    onActionRef,
    onUnblockSuccess,
    profile,
    profileBlockStatus,
  }: {
    onActionRef?: (node: { focus: () => void }) => void;
    onUnblockSuccess?: () => void;
    profile: { handle: string };
    profileBlockStatus?: { blockedBy: boolean; blocking: boolean; profileBlockId: string | null };
  }) => {
    onActionRef?.({ focus: () => stateActionFocus() });
    return createElement('FollowButton', {
      identity: profile.handle,
      onUnblockSuccess,
      profileBlockStatus,
    });
  },
});
mockModule(new URL('./ProfileMuteAction.tsx', import.meta.url), {
  ProfileMuteAction: 'ProfileMuteAction',
});
mockModule(new URL('../ui/ActionMenu.tsx', import.meta.url), {
  ActionMenu: (props: object) => createElement('ActionMenu', props),
});
mockModule(new URL('../ui/ConfirmationContent.tsx', import.meta.url), {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
mockModule(new URL('../ui/ModalSheet.tsx', import.meta.url), {
  ModalSheet: ({ children, ...props }: { children?: ReturnType<typeof createElement> }) =>
    createElement('ModalSheet', props, children),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({
    showToast: (message: string, options: { tone: string }) =>
      toastCalls.push({ message, tone: options.tone }),
  }),
});
mockModule(new URL('./ProfileBlockController.tsx', import.meta.url), {
  useProfileBlockMutations: () => ({
    changeBlocked: (change: object, nextBlocked: boolean) => {
      changeBlockedCalls.push({ change, nextBlocked });
      return changeBlockedImpl(change, nextBlocked);
    },
  }),
});
mockModule(new URL('./profileBlockErrors.ts', import.meta.url), {
  StaleProfileBlockRequestError: class StaleProfileBlockRequestError extends Error {},
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, controlRef, ...props }: { children: string; controlRef?: Ref<unknown> }) => {
    if (controlRef && typeof controlRef === 'object' && 'current' in controlRef) {
      controlRef.current = { focus: () => stateActionFocus() };
    }
    return createElement('Button', props, children);
  },
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
  StateView: ({ controlRef, ...props }: { controlRef?: Ref<unknown> }) => {
    if (controlRef && typeof controlRef === 'object' && 'current' in controlRef) {
      controlRef.current = { focus: () => contentStateFocus() };
    }
    return createElement('StateView', props);
  },
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => relayActorLifecycleKey,
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId, selectedProfileKind }),
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
  relayActorLifecycleKey = 'actor-a';
  selectedProfileId = null;
  selectedProfileKind = null;
  profileBlockStatus = { blockedBy: false, blocking: false, profileBlockId: null };
  profileViewerState = null;
  changeBlockedCalls.length = 0;
  toastCalls.length = 0;
  menuTriggerFocus.mock.resetCalls();
  stateActionFocus.mock.resetCalls();
  contentStateFocus.mock.resetCalls();
  changeBlockedImpl = async () => undefined;
  SlotContent = ProfilePostListPage;
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
          createElement(ProfileLayout, { key: relayActorLifecycleKey }),
        ),
      );
    } else {
      renderer = create(
        createElement(
          LocalParamsContext.Provider,
          { value: layoutLocalParams },
          createElement(ProfileLayout, { key: relayActorLifecycleKey }),
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

  it('selected Profile이 없는 공개 Profile은 auth-required block status 없이 사용할 수 있다', async () => {
    await renderRoute('@public');

    assert.deepEqual(identities('ProfileHero'), ['public']);
    assert.deepEqual(
      queryHistory
        .filter(({ query }) => query === 'ProfileLayoutQuery')
        .map(({ withProfileBlockStatus }) => withProfileBlockStatus),
      [false],
    );
  });

  it('Remote selected actor는 Local-only Block 조회와 action 없이 Profile을 유지한다', async () => {
    selectedProfileId = 'remote-owner';
    selectedProfileKind = 'ACTIVITYPUB';
    profileViewerState = { isSelf: false, membership: { role: 'OWNER' } };

    await renderRoute('@target');

    assert.deepEqual(identities('ProfileHero'), ['target']);
    assert.deepEqual(
      queryHistory
        .filter(({ query }) => query === 'ProfileLayoutQuery')
        .map(({ withProfileBlockStatus }) => withProfileBlockStatus),
      [false],
    );
    assert.equal(
      queryHistory.some(({ query }) => query === 'ProfilePostListPageQuery'),
      true,
    );
    assert.equal(rendered('ActionMenu').length, 0);
  });

  it('인증된 Profile의 viewerState가 한 렌더 동안 없어도 뮤트 메뉴를 유지한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = null;

    await renderRoute('@target');

    assert.equal(requireRendered('ProfileHero').props.showMuteAction, true);
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

  it('자신의 차단 상태는 target identity 없이 해제 action을 제공한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileAvailable = false;
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };

    await renderRoute('@blocked');

    assert.equal(requireRendered('StateView').props.title, '차단한 프로필입니다');
    assert.equal(rendered('ProfileHero').length, 0);
    const action = rendered('Button').find((node) => node.props.accessibilityLabel === '차단 해제');
    assert.ok(action);

    await act(async () => action.props.onPress());
    assert.equal(requireRendered('ModalSheet').props.visible, true);
    assert.equal(requireRendered('ModalSheet').props.title, '이 프로필의 차단을 해제할까요?');
    assert.equal(
      requireRendered('ConfirmationContent').props.message,
      '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.',
    );
    assert.equal(requireRendered('ConfirmationContent').props.tone, 'danger');

    await act(async () => requireRendered('ConfirmationContent').props.onCancel());
    assert.equal(stateActionFocus.mock.callCount(), 0);
    await act(async () => requireRendered('ModalSheet').props.onDismiss());
    assert.equal(stateActionFocus.mock.callCount(), 1);
    assert.equal(changeBlockedCalls.length, 0);
  });

  it('상대에게 차단된 Profile은 actionless StateView만 표시한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileAvailable = false;
    profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };

    await renderRoute('@blocked');

    assert.equal(requireRendered('StateView').props.title, '이 프로필을 볼 수 없습니다');
    assert.equal(rendered('Button').length, 0);
    assert.equal(rendered('ActionMenu').length, 0);
    assert.equal(rendered('ProfileHero').length, 0);
  });

  it('조회 가능한 blocking Profile은 ProfileHero와 확인 전 경고 뒤 Slot 콘텐츠를 유지한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };

    await renderRoute('@blocked');

    assert.deepEqual(identities('ProfileHero'), ['blocked']);
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.title, '차단한 프로필의 게시물입니다');
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');
    assert.deepEqual(requireRendered('FollowButton').props.profileBlockStatus, profileBlockStatus);
    const menu = requireRendered('ActionMenu');
    assert.deepEqual(
      menu.props.items.map((item: { label: string }) => item.label),
      ['차단 해제'],
    );

    await act(async () => menu.props.items[0].onSelect());
    assert.equal(requireRendered('ConfirmationContent').props.confirmLabel, '차단 해제');

    await act(async () => requireRendered('StateView').props.onAction());
    assert.deepEqual(identities('PostList'), ['blocked']);
  });

  it('조회 가능한 blockedBy Profile은 ProfileHero와 콘텐츠 차단 상태를 유지한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };

    await renderRoute('@blocked');

    assert.deepEqual(identities('ProfileHero'), ['blocked']);
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.title, '게시물을 볼 수 없습니다');
    assert.equal(rendered('Button').length, 0);
    assert.equal(rendered('FollowButton').length, 0);
    assert.equal(requireRendered('ProfileHero').props.showMuteAction, false);
  });

  it('차단 관계에서도 followers와 following route의 관계 목록 Slot을 유지한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    SlotContent = () => createElement('RelationshipList');

    for (const status of [
      { blockedBy: false, blocking: true, profileBlockId: 'block-1' },
      { blockedBy: true, blocking: false, profileBlockId: null },
    ]) {
      profileBlockStatus = status;
      for (const relation of ['followers', 'following']) {
        await renderRoute('@blocked', `/profile/@blocked/${relation}`);
        assert.equal(rendered('RelationshipList').length, 1);
        assert.equal(rendered('StateView').length, 0);
      }
    }
  });

  it('서로 차단한 Profile은 공통 action을 표시하고 내 해제 뒤 상대 차단이 남으면 숨긴다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: true, blocking: true, profileBlockId: 'block-1' };

    await renderRoute('@blocked');
    assert.deepEqual(requireRendered('FollowButton').props.profileBlockStatus, profileBlockStatus);
    assert.equal(requireRendered('ProfileHero').props.showMuteAction, false);
    assert.deepEqual(
      requireRendered('ActionMenu').props.items.map((item: { label: string }) => item.label),
      ['차단 해제'],
    );
    await act(async () => requireRendered('FollowButton').props.onUnblockSuccess());

    profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };
    relayActorLifecycleKey = 'actor-b';
    await renderRoute('@blocked');
    assert.equal(rendered('FollowButton').length, 0);
    assert.equal(requireRendered('ProfileHero').props.showMuteAction, false);

    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.equal(contentStateFocus.mock.callCount(), 1);
    assert.equal(menuTriggerFocus.mock.callCount(), 0);
  });

  it('selected Profile 자기 자신에게는 차단 action을 표시하지 않는다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: true, membership: { role: 'OWNER' } };
    await renderRoute('@local');
    assert.equal(rendered('ActionMenu').length, 0);

    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    await renderRoute('@target');
    const menu = requireRendered('ActionMenu');
    assert.equal(menu.props.items[0].label, '차단');
  });

  it('Profile 메뉴의 차단 실패는 확인창을 닫고 trigger로 복귀한 뒤 다시 열어 재시도한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    let attempts = 0;
    changeBlockedImpl = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('network');
      }
    };
    await renderRoute('@target');

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    const confirmation = requireRendered('ConfirmationContent');
    assert.equal(confirmation.props.confirmLabel, '차단');
    assert.equal(
      confirmation.props.message,
      '상대방은 내 게시물을 볼 수 없고, 타임라인과 검색에서 서로의 게시물이 숨겨져요. 팔로우 관계와 요청은 삭제돼요.',
    );
    assert.equal(confirmation.props.tone, 'danger');

    await act(async () => confirmation.props.onConfirm());
    assert.equal(changeBlockedCalls.length, 1);
    assert.equal(requireRendered('ModalSheet').props.visible, false);
    assert.equal(toastCalls.at(-1)?.tone, 'danger');
    await act(async () => requireRendered('ModalSheet').props.onDismiss());
    assert.equal(menuTriggerFocus.mock.callCount(), 1);

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    await act(async () => requireRendered('ConfirmationContent').props.onConfirm());
    assert.equal(changeBlockedCalls.length, 2);
    assert.equal(requireRendered('ModalSheet').props.visible, false);
    assert.equal(toastCalls.at(-1)?.tone, 'success');
  });

  it('Profile 메뉴의 차단 확인을 취소하면 더보기 trigger로 포커스를 복원한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    await renderRoute('@target');

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    await act(async () => requireRendered('ConfirmationContent').props.onCancel());
    await act(async () => requireRendered('ModalSheet').props.onDismiss());

    assert.equal(menuTriggerFocus.mock.callCount(), 1);
  });

  it('Profile 메뉴의 차단 성공 후 actor remount를 넘어 결과 action으로 포커스를 복원한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    changeBlockedImpl = async (_change, nextBlocked) => {
      if (nextBlocked) {
        profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
        relayActorLifecycleKey = 'actor-b';
      }
    };
    await renderRoute('@target');

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    await act(async () => requireRendered('ConfirmationContent').props.onConfirm());
    await renderRoute('@target');

    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.equal(menuTriggerFocus.mock.callCount(), 0);
    assert.equal(stateActionFocus.mock.callCount(), 1);
  });

  it('identity-free 차단 해제 성공 후 actor remount를 넘어 다시 나타난 메뉴로 포커스를 복원한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileAvailable = false;
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    changeBlockedImpl = async (_change, nextBlocked) => {
      if (!nextBlocked) {
        profileAvailable = true;
        profileBlockStatus = { blockedBy: false, blocking: false, profileBlockId: null };
        relayActorLifecycleKey = 'actor-b';
      }
    };
    await renderRoute('@target');

    const action = rendered('Button').find((node) => node.props.accessibilityLabel === '차단 해제');
    assert.ok(action);
    await act(async () => action.props.onPress());
    await act(async () => requireRendered('ConfirmationContent').props.onConfirm());
    await renderRoute('@target');

    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.equal(menuTriggerFocus.mock.callCount(), 1);
    assert.equal(stateActionFocus.mock.callCount(), 0);
  });

  it('identity-free 양방향 차단 해제 후 남은 차단 콘텐츠 상태로 포커스를 복원한다', async () => {
    selectedProfileId = 'owner';
    selectedProfileKind = 'LOCAL';
    profileAvailable = false;
    profileBlockStatus = { blockedBy: true, blocking: true, profileBlockId: 'block-1' };
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    changeBlockedImpl = async (_change, nextBlocked) => {
      if (!nextBlocked) {
        profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };
        relayActorLifecycleKey = 'actor-b';
      }
    };
    await renderRoute('@target');

    const action = rendered('Button').find((node) => node.props.accessibilityLabel === '차단 해제');
    assert.ok(action);
    await act(async () => action.props.onPress());
    await act(async () => requireRendered('ConfirmationContent').props.onConfirm());
    await renderRoute('@target');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    assert.equal(contentStateFocus.mock.callCount(), 1);
    assert.equal(menuTriggerFocus.mock.callCount(), 0);
  });
});
