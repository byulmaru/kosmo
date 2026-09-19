import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode, Ref } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FollowButton as FollowButtonExport } from './FollowButton';
import type {
  ProfileBlockAction as ProfileBlockActionExport,
  ProfileBlockActionTarget,
} from './ProfileBlockAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

type QueryMode = 'error' | 'loading' | 'success';
type QueryName =
  | 'ProfileFollowersPageQuery'
  | 'ProfileFollowingPageQuery'
  | 'ProfileLayoutQuery'
  | 'ProfilePostListPageQuery';

const queryModes: Record<QueryName, QueryMode> = {
  ProfileFollowersPageQuery: 'success',
  ProfileFollowingPageQuery: 'success',
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
type ReportMenuInput = {
  id: string;
  kind: 'PROFILE';
  label: string;
};
type ReportMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  tone: string;
};

const reportMenuItem: ReportMenuItem = {
  key: 'report-profile',
  label: '신고',
  onSelect: () => undefined,
  tone: 'danger',
};

const LocalParamsContext = createContext<RouteParams>({});
const platform: { OS: 'web' | 'ios' } = { OS: 'web' };

let globalParams: RouteParams = {};
let layoutLocalParams: RouteParams = {};
let screenLocalParams: RouteParams = {};
let pathname = '/profile/';
let renderer: ReactTestRenderer | null = null;
let SlotContent: ComponentType | null = null;
let profileAvailable = true;
let profileDisplayName: string | null = null;
let profileInstanceKind: 'ACTIVITYPUB' | 'LOCAL' = 'LOCAL';
const routerHistory: string[] = [];
let routerBackCount = 0;
let routerCanGoBack = true;
let sessionId: string | null = null;
let selectedProfileId: string | null = null;
let profileBlockStatus: {
  blockedBy: boolean;
  blocking: boolean;
  profileBlockId: string | null;
} | null = {
  blockedBy: false,
  blocking: false,
  profileBlockId: null,
};
let profileViewerState: {
  isSelf: boolean;
  membership: { role: 'MEMBER' | 'OWNER' } | null;
  profileBlock?: { id: string; targetProfile: object } | null;
} | null = null;
let postListProfileBlockId: string | null = null;
const capturedReport = { value: null as ReportMenuInput | null };
const changeBlockedCalls: Array<{ change: object; nextBlocked: boolean }> = [];
const toastCalls: Array<{ message: string; tone: string }> = [];
const focusHistory: string[] = [];
const menuTriggerFocus = mock.fn(() => focusHistory.push('menu'));
const stateActionFocus = mock.fn(() => focusHistory.push('state'));
const relayEnvironment = {};
const relayEnvironmentGeneration = { current: 0 };
let changeBlockedImpl: (change: object, nextBlocked: boolean) => Promise<void> = async () =>
  undefined;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Slot: () =>
    SlotContent
      ? createElement(
          LocalParamsContext.Provider,
          { value: screenLocalParams },
          createElement(SlotContent),
        )
      : null,
  Stack: () =>
    createElement(
      'Stack',
      null,
      SlotContent
        ? createElement(
            LocalParamsContext.Provider,
            { value: screenLocalParams },
            createElement(SlotContent),
          )
        : null,
    ),
  useGlobalSearchParams: () => globalParams,
  useLocalSearchParams: () => useContext(LocalParamsContext),
  usePathname: () => pathname,
  useRouter: () => ({
    back: () => (routerBackCount += 1),
    canGoBack: () => routerCanGoBack,
    replace: (href: string) => routerHistory.push(href),
  }),
});
mockModule('lucide-react-native', {
  ArrowLeft: 'ArrowLeft',
  Ban: 'Ban',
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule(require.resolve('lucide-react-native'), {
  ArrowLeft: 'ArrowLeft',
  Ban: 'Ban',
  ChevronLeftIcon: 'ChevronLeftIcon',
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
    const query = parts
      .join('')
      .match(
        /query (ProfileFollowersPageQuery|ProfileFollowingPageQuery|ProfileLayoutQuery|ProfilePostListPageQuery)/,
      )?.[1];
    return (query ?? parts.join('')) as QueryName;
  },
  useFragment: (_fragment: unknown, reference: unknown) => reference,
  useMutation: (mutation: string) => {
    const [pending, setPending] = useState(false);
    const block = mutation.includes('ProfileBlockActionBlockMutation');
    const unblock = mutation.includes('ProfileBlockActionUnblockMutation');
    if (!block && !unblock) {
      return [() => assert.fail('Block consumer must not execute a Follow mutation'), false];
    }
    return [
      (config: {
        onCompleted: (response: object) => void;
        onError: (error: Error) => void;
        variables: { id: string };
      }) => {
        const nextBlocked = block;
        const handle = String(globalParams.profileHandle ?? '').replace(/^@/, '');
        const change = {
          ownerProfileId: selectedProfileId,
          profileBlockId: nextBlocked ? null : config.variables.id,
          targetProfileId: nextBlocked ? config.variables.id : `profile:${handle}`,
        };
        changeBlockedCalls.push({ change, nextBlocked });
        setPending(true);
        void changeBlockedImpl(change, nextBlocked).then(
          () => {
            setPending(false);
            config.onCompleted(
              nextBlocked
                ? { blockProfile: { profileBlock: { id: 'block-1' }, success: true } }
                : {
                    unblockProfile: { profileBlockId: config.variables.id, success: true },
                  },
            );
          },
          (error: Error) => {
            setPending(false);
            config.onError(error);
          },
        );
      },
      pending,
    ];
  },
  useRelayEnvironment: () => relayEnvironment,
  useLazyLoadQuery: (
    query: QueryName,
    variables: { handle: string },
    options: { fetchKey: number },
  ) => {
    queryHistory.push({
      fetchKey: options.fetchKey,
      handle: variables.handle,
      query,
    });
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
      profileBlockStatus: selectedProfileId ? profileBlockStatus : null,
      profileByHandle: profileAvailable
        ? {
            displayName: profileDisplayName ?? `Display ${variables.handle}`,
            handle: variables.handle,
            id: `profile:${variables.handle}`,
            instance: { kind: profileInstanceKind },
            relativeHandle: `@${variables.handle}`,
            viewerState:
              query === 'ProfilePostListPageQuery'
                ? {
                    profileBlock: postListProfileBlockId ? { id: postListProfileBlockId } : null,
                  }
                : profileViewerState,
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
    moreItems,
    profile,
    profileBlockStatus,
  }: {
    action?: ReturnType<typeof createElement>;
    heading?: boolean;
    loading?: boolean;
    moreItems?: readonly ReportMenuItem[];
    profile?: {
      handle: string;
      viewerState?: {
        isSelf?: boolean;
        profileBlock?: ProfileBlockActionTarget['profileBlock'];
      } | null;
    };
    profileBlockStatus?: { blockedBy: boolean; blocking: boolean } | null;
  }) => {
    const canManageRelationship =
      profileBlockStatus != null && profile?.viewerState?.isSelf !== true;
    const profileBlock = profile?.viewerState?.profileBlock;
    const blockAction = (
      canManageRelationship
        ? profileBlockStatus.blocking && profileBlock
          ? ({ nextBlocked: false, profileBlock } as const)
          : !profileBlockStatus.blockedBy && profile
            ? ({ nextBlocked: true, profile } as const)
            : undefined
        : undefined
    ) as ProfileBlockActionTarget | undefined;
    return createElement(
      'ProfileHero',
      {
        heading,
        identity: loading ? 'loading' : profile?.handle,
        moreItems,
        profileBlockStatus,
      },
      blockAction
        ? createElement(ProfileBlockAction, {
            ...blockAction,
            icon: 'Ban' as never,
            renderMenuItem: ({
              focusTriggerRef,
              item,
            }: {
              focusTriggerRef: { current: () => void };
              item: object;
            }) => {
              focusTriggerRef.current = () => menuTriggerFocus();
              return createElement('ActionMenu', { items: [item, ...(moreItems ?? [])] });
            },
            surface: 'menu',
          })
        : moreItems
          ? createElement('ActionMenu', { items: moreItems })
          : null,
      action,
    );
  },
});
mockModule(new URL('../content-report/ContentReportContext.tsx', import.meta.url), {
  useContentReportMenuItem: (input: ReportMenuInput) => {
    capturedReport.value = input;
    return reportMenuItem;
  },
});
mockModule(new URL('../../analytics/client.ts', import.meta.url), {
  trackAnalytics: () => undefined,
});
mockModule(new URL('./ProfileMuteAction.tsx', import.meta.url), {
  ProfileMuteAction: 'ProfileMuteAction',
});
mockModule(new URL('./ProfileMuteController.tsx', import.meta.url), {
  useProfileMuteMutations: () => ({ changeMuted: () => Promise.resolve() }),
});
mockModule(new URL('./ProfileConnectionList.tsx', import.meta.url), {
  ProfileConnectionList: ({ kind, profile }: { kind: string; profile: { handle: string } }) =>
    createElement('ProfileConnectionList', { identity: profile.handle, kind }),
  ProfileConnectionListState: (props: object) => createElement('ProfileConnectionListState', props),
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: ({ leading, ...props }: { leading?: ReactNode }) =>
    createElement('PageHeader', { ...props, leading }, leading),
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
mockModule(new URL('../../relay/RelayEnvironmentBoundary.tsx', import.meta.url), {
  useRelayEnvironmentGeneration: () => relayEnvironmentGeneration,
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, controlRef, ...props }: { children: string; controlRef?: Ref<unknown> }) => {
    if (typeof controlRef === 'function') {
      controlRef({ focus: () => stateActionFocus() });
    } else if (controlRef && typeof controlRef === 'object' && 'current' in controlRef) {
      controlRef.current = { focus: () => stateActionFocus() };
    }
    return createElement('Button', props, children);
  },
});
mockModule(new URL('../ui/IconButton.tsx', import.meta.url), {
  IconButton: ({ children, ...props }: { children: ReactNode }) =>
    createElement('IconButton', props, children),
});
mockModule(new URL('../ui/Tabs.tsx', import.meta.url), {
  Tab: ({ option }: { option: { label: string; value: string } }) => createElement('Tab', option),
  TabList: ({ children, ...props }: { children: ReactNode }) =>
    createElement('TabList', props, children),
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
    const postList = createElement(
      'PostList',
      {
        identity: error ? 'error' : loading ? 'loading' : profile?.handle,
        onRetry,
      },
      platform.OS === 'web' ? undefined : createElement('FlatList'),
    );
    return postList;
  },
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId, sessionId }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ foregroundPrimary: '#111111' }),
});

let ProfileFollowersPage: ComponentType;
let ProfileFollowingPage: ComponentType;
let ProfileLayout: ComponentType;
let ProfilePostListPage: ComponentType;
let ProfileBlockAction: typeof ProfileBlockActionExport;
let FollowButton: typeof FollowButtonExport;

before(async () => {
  ({ ProfileBlockAction } = await import('./ProfileBlockAction'));
  ({ FollowButton } = await import('./FollowButton'));
  ({ default: ProfileFollowersPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/followers'));
  ({ default: ProfileFollowingPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/following'));
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
  routerBackCount = 0;
  routerCanGoBack = true;
  routerHistory.length = 0;
  queryModes.ProfileFollowersPageQuery = 'success';
  queryModes.ProfileFollowingPageQuery = 'success';
  queryModes.ProfileLayoutQuery = 'success';
  queryModes.ProfilePostListPageQuery = 'success';
  queryHistory.length = 0;
  profileAvailable = true;
  profileDisplayName = null;
  profileInstanceKind = 'LOCAL';
  selectedProfileId = null;
  profileBlockStatus = { blockedBy: false, blocking: false, profileBlockId: null };
  profileViewerState = null;
  postListProfileBlockId = null;
  SlotContent = ProfilePostListPage;
  sessionId = null;
  capturedReport.value = null;
  changeBlockedCalls.length = 0;
  toastCalls.length = 0;
  menuTriggerFocus.mock.resetCalls();
  stateActionFocus.mock.resetCalls();
  focusHistory.length = 0;
  changeBlockedImpl = async () => undefined;
  SlotContent = ProfilePostListPage;
});

async function renderRoute(profileHandle: string, routePath = `/profile/${profileHandle}`) {
  globalParams = { profileHandle };
  screenLocalParams = { profileHandle };
  pathname = routePath;
  SlotContent = routePath.endsWith('/followers')
    ? ProfileFollowersPage
    : routePath.endsWith('/following')
      ? ProfileFollowingPage
      : ProfilePostListPage;
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
  return rendered(type).map((node) =>
    type === 'FollowButton'
      ? (node.props.profile.handle as string)
      : (node.props.identity as string),
  );
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll(
    (node) => node.type === (type === 'FollowButton' ? FollowButton : type),
  );
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
    const tree = renderer?.toJSON();
    const route = Array.isArray(tree) ? tree[0] : tree;
    assert.ok(route);
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

  it('directly opened Profile Home returns to Home instead of dispatching an unhandled back action', async () => {
    routerCanGoBack = false;
    await renderRoute('@local', '/@local');

    const leading = requireRendered('PageHeader').props.leading;
    assert.ok(leading);
    await act(async () => leading.props.onPress());

    assert.equal(routerBackCount, 0);
    assert.deepEqual(routerHistory, ['/home']);
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

  it('인증 사용자에게만 프로필 신고 메뉴를 연결한다', async () => {
    sessionId = 'session:viewer';
    await renderRoute('@local');

    const authenticatedMoreItems = requireRendered('ProfileHero').props.moreItems as
      | readonly ReportMenuItem[]
      | undefined;
    assert.ok(authenticatedMoreItems);
    assert.equal(authenticatedMoreItems.length, 1);
    assert.equal(authenticatedMoreItems[0], reportMenuItem);

    sessionId = null;
    await renderRoute('@local');
    assert.equal(requireRendered('ProfileHero').props.moreItems, undefined);
  });

  it('신고 메뉴는 selected Profile과 차단 방향에 관계없이 로그인 상태를 따른다', async () => {
    sessionId = 'session:viewer';
    profileBlockStatus = null;
    await renderRoute('@target');
    assert.deepEqual(requireRendered('ActionMenu').props.items, [reportMenuItem]);

    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };
    await renderRoute('@target');
    assert.deepEqual(requireRendered('ActionMenu').props.items, [reportMenuItem]);
    assert.equal(rendered('FollowButton').length, 0);
    assert.deepEqual(requireRendered('ProfileHero').props.profileBlockStatus, profileBlockStatus);
  });

  it('selected Profile이 없는 공개 Profile은 nullable block status와 함께 사용할 수 있다', async () => {
    await renderRoute('@public');

    assert.deepEqual(identities('ProfileHero'), ['public']);
  });

  it('인증됐지만 Block 읽기 권한이 없으면 Block 관리 action을 표시하지 않는다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = null;

    await renderRoute('@target');

    assert.deepEqual(identities('ProfileHero'), ['target']);
    assert.equal(rendered('ActionMenu').length, 0);
  });
  it('인증된 Profile의 viewerState가 한 렌더 동안 없어도 뮤트 메뉴를 유지한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = null;

    await renderRoute('@target');

    assert.deepEqual(requireRendered('ProfileHero').props.profileBlockStatus, profileBlockStatus);
  });
  it('표시 중인 selected Local Owner Profile에만 편집 Link를 노출한다', async () => {
    profileViewerState = { isSelf: true, membership: { role: 'OWNER' } };
    await renderRoute('@local');

    assert.deepEqual(capturedReport.value, {
      id: 'profile:local',
      kind: 'PROFILE',
      label: '@local',
    });

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

  it('followers와 following을 독립 heading과 관계 tab으로 전환한다', async () => {
    await renderRoute('@local', '/@local/followers');

    assert.deepEqual(identities('ProfileHero'), []);
    assert.deepEqual(identities('FollowButton'), []);
    assert.deepEqual(identities('ProfileConnectionList'), ['local']);
    assert.equal(requireRendered('ProfileConnectionList').props.kind, 'followers');
    assert.equal(requireRendered('PageHeader').props.title, 'Display local님의 팔로워');
    assert.equal(requireRendered('TabList').props.value, 'followers');
    assert.deepEqual(
      rendered('Tab').map(({ props }) => [props.label, props.value]),
      [
        ['팔로워', 'followers'],
        ['팔로잉', 'following'],
      ],
    );

    await act(async () => requireRendered('TabList').props.onValueChange('following'));
    await act(async () => requireRendered('IconButton').props.onPress());
    assert.deepEqual(routerHistory, ['/@local/following', '/@local']);
    assert.equal(requireRendered('IconButton').props.accessibilityLabel, '프로필로 돌아가기');
    assert.equal(requireRendered('IconButton').props.targetSize, 44);
    assert.equal(requireRendered('IconButton').props.visualSize, 44);

    await renderRoute('@local', '/@local/following');
    assert.deepEqual(identities('ProfileHero'), []);
    assert.deepEqual(identities('ProfileConnectionList'), ['local']);
    assert.equal(requireRendered('ProfileConnectionList').props.kind, 'following');
    assert.equal(requireRendered('PageHeader').props.title, 'Display local님의 팔로잉');
    assert.equal(requireRendered('TabList').props.value, 'following');
  });

  it('관계 route는 displayName이 비어도 handle을 제목에 사용한다', async () => {
    profileDisplayName = '';

    await renderRoute('@local', '/@local/followers');
    assert.equal(requireRendered('PageHeader').props.title, 'local님의 팔로워');

    await renderRoute('@local', '/@local/following');
    assert.equal(requireRendered('PageHeader').props.title, 'local님의 팔로잉');
  });

  it('native layout은 route별 Stack과 screen-owned scroll owner를 교체한다', async () => {
    platform.OS = 'ios';

    await renderRoute('@local', '/profile/@local');
    assert.equal(rendered('Stack').length, 1);
    assert.equal(rendered('PostList').length, 1);
    assert.equal(rendered('FlatList').length, 1);
    const homeScrollViews = rendered('ScrollView');
    assert.equal(homeScrollViews.length, 1);
    assert.equal(
      homeScrollViews[0]?.findAll((node) => (node.type as unknown) === 'ProfileHero').length,
      1,
    );
    assert.equal(
      homeScrollViews[0]?.findAll((node) => (node.type as unknown) === 'PostList').length,
      1,
    );

    await renderRoute('@local', '/@local/followers');

    const scrollViews = rendered('ScrollView');
    assert.equal(scrollViews.length, 1);
    assert.equal(rendered('Stack').length, 1);
    assert.equal(rendered('FlatList').length, 0);
    assert.equal(rendered('PageHeader').length, 1);
    assert.equal(rendered('TabList').length, 1);
    assert.equal(
      scrollViews[0]?.findAll((node) => (node.type as unknown) === 'ProfileConnectionList').length,
      1,
    );
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

  it('같은 handle의 관계 route layout error를 route mode 전환에서 초기화한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryModes.ProfileLayoutQuery = 'error';
      await renderRoute('@local', '/@local/followers');
      assert.equal(requireRendered('ProfileConnectionListState').props.state, 'error');

      queryModes.ProfileLayoutQuery = 'success';
      await renderRoute('@local', '/@local/following');
      assert.equal(requireRendered('ProfileConnectionList').props.kind, 'following');

      queryModes.ProfileLayoutQuery = 'error';
      await renderRoute('@local', '/@local/following');
      assert.equal(requireRendered('ProfileConnectionListState').props.state, 'error');

      queryModes.ProfileLayoutQuery = 'success';
      await renderRoute('@local');
      assert.deepEqual(identities('ProfileHero'), ['local']);
    } finally {
      console.error = originalConsoleError;
    }
  });

  for (const [kind, path, query] of [
    ['followers', '/@local/followers', 'ProfileFollowersPageQuery'],
    ['following', '/@local/following', 'ProfileFollowingPageQuery'],
  ] as const) {
    it(`${kind} leaf query error를 표시하고 retry에서 같은 query를 다시 실행한다`, async () => {
      const originalConsoleError = console.error;
      console.error = () => undefined;
      try {
        queryModes[query] = 'error';
        await renderRoute('@local', path);
        const errorState = requireRendered('ProfileConnectionListState');
        assert.equal(errorState.props.kind, kind);
        assert.equal(errorState.props.state, 'error');

        queryModes[query] = 'success';
        await act(async () => errorState.props.onRetry());

        assert.equal(requireRendered('ProfileConnectionList').props.kind, kind);
        const latestQuery = queryHistory.findLast(({ query: current }) => current === query);
        assert.equal(latestQuery?.handle, 'local');
        assert.equal(latestQuery?.fetchKey, 1);
      } finally {
        console.error = originalConsoleError;
      }
    });
  }

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

  it('Profile 자체가 조회 불가하면 별도 차단 관계 action을 합성하지 않는다', async () => {
    selectedProfileId = 'owner';
    profileAvailable = false;
    profileBlockStatus = { blockedBy: false, blocking: false, profileBlockId: null };

    await renderRoute('@blocked', '/@blocked');

    const header = requireRendered('PageHeader');
    assert.equal(header.props.title, '');
    assert.ok(header.props.leading);
    await act(async () => header.props.leading.props.onPress());
    assert.equal(routerBackCount, 1);

    assert.equal(requireRendered('StateView').props.title, '프로필을 찾을 수 없어요');
    assert.equal(rendered('ProfileHero').length, 0);
    assert.equal(rendered('Button').length, 0);
    assert.equal(changeBlockedCalls.length, 0);
  });

  it('조회 가능한 blocking Profile은 ProfileHero와 확인 전 경고 뒤 Slot 콘텐츠를 유지한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = {
      isSelf: false,
      membership: { role: 'MEMBER' },
      profileBlock: {
        id: 'block-1',
        targetProfile: {
          displayName: 'Display blocked',
          id: 'profile:blocked',
          relativeHandle: '@blocked',
        },
      },
    };
    postListProfileBlockId = 'block-1';
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };

    await renderRoute('@blocked');

    assert.deepEqual(identities('ProfileHero'), ['blocked']);
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.title, '차단한 프로필의 게시물입니다');
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');
    assert.deepEqual(identities('FollowButton'), ['blocked']);
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

  it('route block status와 Profile viewerState를 독립 fixture로 관찰한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = {
      isSelf: false,
      membership: { role: 'MEMBER' },
      profileBlock: null,
    };
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
    postListProfileBlockId = null;

    await renderRoute('@blocked');

    assert.deepEqual(requireRendered('ProfileHero').props.profileBlockStatus, profileBlockStatus);
    assert.deepEqual(identities('PostList'), ['blocked']);
    assert.equal(
      requireRendered('FollowButton').findByType('Button' as never).props.children,
      '팔로우',
    );
  });

  it('조회 가능한 blockedBy Profile은 ProfileHero와 콘텐츠 차단 상태를 유지한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };

    await renderRoute('@blocked');

    assert.deepEqual(identities('ProfileHero'), ['blocked']);
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.title, '이 프로필을 볼 수 없습니다');
    assert.equal(rendered('Button').length, 0);
    assert.equal(rendered('FollowButton').length, 0);
    assert.deepEqual(requireRendered('ProfileHero').props.profileBlockStatus, profileBlockStatus);
  });

  it('경고는 시간 경과로 사라지지 않고 handle과 상위 actor boundary remount마다 다시 적용된다', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
    postListProfileBlockId = 'block-1';

    await renderRoute('@blocked', '/@blocked');
    await act(async () => t.mock.timers.tick(86_400_000));
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');

    await act(async () => requireRendered('StateView').props.onAction());
    await renderRoute('@blocked', '/@blocked');
    assert.deepEqual(identities('PostList'), ['blocked']);

    await renderRoute('@other', '/@other');
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');
    await act(async () => requireRendered('StateView').props.onAction());
    assert.deepEqual(identities('PostList'), ['other']);

    selectedProfileId = 'owner-b';
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-b' };
    postListProfileBlockId = 'block-b';
    await act(async () => renderer?.unmount());
    renderer = null;
    await renderRoute('@other', '/@other');
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');
    await act(async () => requireRendered('StateView').props.onAction());

    await act(async () => renderer?.unmount());
    renderer = null;
    await renderRoute('@other', '/@other');
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');
  });

  it('같은 Profile을 해제한 뒤 재차단하면 게시물 경고를 다시 확인한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
    postListProfileBlockId = 'block-1';

    await renderRoute('@blocked', '/@blocked');
    await act(async () => requireRendered('StateView').props.onAction());
    assert.deepEqual(identities('PostList'), ['blocked']);

    profileBlockStatus = { blockedBy: false, blocking: false, profileBlockId: null };
    postListProfileBlockId = null;
    await renderRoute('@blocked', '/@blocked');
    assert.deepEqual(identities('PostList'), ['blocked']);

    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-2' };
    postListProfileBlockId = 'block-2';
    await renderRoute('@blocked', '/@blocked');
    assert.deepEqual(identities('PostList'), []);
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');
  });

  it('Profile 공통 FollowButton의 해제는 확인·취소·pending·실패·재시도를 거친다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = {
      isSelf: false,
      membership: { role: 'MEMBER' },
      profileBlock: {
        id: 'block-1',
        targetProfile: {
          displayName: 'Display blocked',
          id: 'profile:blocked',
          relativeHandle: '@blocked',
        },
      },
    };
    profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
    postListProfileBlockId = 'block-1';
    let rejectRequest: ((error: Error) => void) | undefined;
    changeBlockedImpl = () =>
      new Promise<void>((_resolve, reject) => {
        rejectRequest = reject;
      });
    await renderRoute('@blocked', '/@blocked');
    const relation = requireRendered('FollowButton');
    const button = () => relation.findByType('Button' as never);
    const modal = () => relation.findByType('ModalSheet' as never);
    const confirmation = () => relation.findByType('ConfirmationContent' as never);

    assert.equal(button().props.children, '차단 해제');
    await act(async () => button().props.onPress());
    assert.equal(modal().props.title, '이 프로필의 차단을 해제할까요?');
    assert.equal(
      confirmation().props.message,
      '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.',
    );
    await act(async () => confirmation().props.onCancel());
    await act(async () => modal().props.onDismiss());
    assert.equal(changeBlockedCalls.length, 0);
    assert.equal(stateActionFocus.mock.callCount(), 1);

    await act(async () => button().props.onPress());
    await act(async () => confirmation().props.onConfirm());
    await act(async () => {
      confirmation().props.onConfirm();
      modal().props.onClose();
    });
    assert.deepEqual(changeBlockedCalls, [
      {
        change: {
          ownerProfileId: 'owner',
          profileBlockId: 'block-1',
          targetProfileId: 'profile:blocked',
        },
        nextBlocked: false,
      },
    ]);
    assert.equal(confirmation().props.pending, true);
    assert.equal(modal().props.dismissDisabled, true);
    assert.equal(modal().props.visible, true);
    assert.deepEqual(button().props.accessibilityState, { busy: true, disabled: true });

    await act(async () => rejectRequest?.(new Error('network')));
    await act(async () => modal().props.onDismiss());
    assert.equal(toastCalls.at(-1)?.tone, 'danger');
    assert.equal(button().props.children, '차단 해제');
    assert.equal(requireRendered('StateView').props.actionLabel, '게시물 보기');

    changeBlockedImpl = async () => {
      profileBlockStatus = { blockedBy: false, blocking: false, profileBlockId: null };
      profileViewerState = { isSelf: false, membership: { role: 'MEMBER' }, profileBlock: null };
      postListProfileBlockId = null;
    };
    await act(async () => button().props.onPress());
    await act(async () => confirmation().props.onConfirm());
    await renderRoute('@blocked', '/@blocked');
    assert.equal(changeBlockedCalls.length, 2);
    assert.equal(
      requireRendered('FollowButton').findByType('Button' as never).props.children,
      '팔로우',
    );
    assert.deepEqual(identities('PostList'), ['blocked']);
    assert.equal(toastCalls.at(-1)?.tone, 'success');
  });

  it('차단 관계에서도 followers와 following route의 관계 목록 Slot을 유지한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };

    for (const status of [
      { blockedBy: false, blocking: true, profileBlockId: 'block-1' },
      { blockedBy: true, blocking: false, profileBlockId: null },
    ]) {
      profileBlockStatus = status;
      for (const relation of ['followers', 'following']) {
        await renderRoute('@blocked', `/profile/@blocked/${relation}`);
        assert.deepEqual(identities('ProfileConnectionList'), ['blocked']);
        assert.equal(requireRendered('ProfileConnectionList').props.kind, relation);
        assert.equal(rendered('StateView').length, 0);
      }
    }
  });

  it('서로 차단한 Profile은 공통 action을 표시하고 내 해제 뒤 상대 차단이 남으면 숨긴다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = {
      isSelf: false,
      membership: { role: 'MEMBER' },
      profileBlock: {
        id: 'block-1',
        targetProfile: {
          displayName: 'Display blocked',
          id: 'profile:blocked',
          relativeHandle: '@blocked',
        },
      },
    };
    profileBlockStatus = { blockedBy: true, blocking: true, profileBlockId: 'block-1' };

    await renderRoute('@blocked');
    assert.deepEqual(identities('FollowButton'), ['blocked']);
    assert.deepEqual(requireRendered('ProfileHero').props.profileBlockStatus, profileBlockStatus);
    assert.deepEqual(
      requireRendered('ActionMenu').props.items.map((item: { label: string }) => item.label),
      ['차단 해제'],
    );
    changeBlockedImpl = async () => {
      profileBlockStatus = { blockedBy: true, blocking: false, profileBlockId: null };
      profileViewerState = { isSelf: false, membership: { role: 'MEMBER' }, profileBlock: null };
    };
    const action = requireRendered('FollowButton');
    await act(async () => action.findByType('Button' as never).props.onPress());
    await act(async () => action.findByType('ConfirmationContent' as never).props.onConfirm());
    await renderRoute('@blocked');
    assert.equal(rendered('FollowButton').length, 0);
    assert.deepEqual(requireRendered('ProfileHero').props.profileBlockStatus, profileBlockStatus);

    assert.equal(menuTriggerFocus.mock.callCount(), 0);
  });

  it('selected Profile 자기 자신에게는 차단 action을 표시하지 않는다', async () => {
    selectedProfileId = 'owner';
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
    assert.equal(toastCalls.length, 0);
    await act(async () => requireRendered('ModalSheet').props.onDismiss());
    assert.equal(toastCalls.at(-1)?.tone, 'danger');
    assert.equal(menuTriggerFocus.mock.callCount(), 1);

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    await act(async () => requireRendered('ConfirmationContent').props.onConfirm());
    assert.equal(changeBlockedCalls.length, 2);
    assert.equal(requireRendered('ModalSheet').props.visible, false);
    assert.equal(toastCalls.length, 1);
    await act(async () => requireRendered('ModalSheet').props.onDismiss());
    assert.equal(toastCalls.at(-1)?.tone, 'success');
  });

  it('Profile 메뉴의 차단 확인을 취소하면 더보기 trigger로 포커스를 복원한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    await renderRoute('@target');

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    await act(async () => requireRendered('ConfirmationContent').props.onCancel());
    await act(async () => requireRendered('ModalSheet').props.onDismiss());

    assert.equal(menuTriggerFocus.mock.callCount(), 1);
  });

  it('Profile 메뉴의 차단 성공 후 같은 component lifecycle에서 결과 action으로 포커스를 복원한다', async () => {
    selectedProfileId = 'owner';
    profileViewerState = { isSelf: false, membership: { role: 'MEMBER' } };
    changeBlockedImpl = async (_change, nextBlocked) => {
      if (nextBlocked) {
        profileBlockStatus = { blockedBy: false, blocking: true, profileBlockId: 'block-1' };
      }
    };
    await renderRoute('@target');

    await act(async () => requireRendered('ActionMenu').props.items[0].onSelect());
    await act(async () => requireRendered('ConfirmationContent').props.onConfirm());
    await renderRoute('@target');
    assert.deepEqual(focusHistory, []);
    await act(async () => requireRendered('ModalSheet').props.onDismiss());
    assert.deepEqual(focusHistory, ['menu']);
    assert.equal(menuTriggerFocus.mock.callCount(), 1);
    assert.equal(stateActionFocus.mock.callCount(), 0);
  });
});
