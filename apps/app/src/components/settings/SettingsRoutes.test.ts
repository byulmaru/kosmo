import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { RouteScrollContainerProps } from '../ui/RouteScrollContainer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

let platform: 'android' | 'ios' | 'web' = 'web';
let width = 1_280;
let dismissedToPaths: string[] = [];
let replacedPaths: string[] = [];
let pathname = '/settings';
let SlotRoute: ComponentType = () => null;
let sessionStatus: 'error' | 'guest' | 'valid' = 'guest';
let otaUpdateId: string | null = null;
let otaRuntimeVersion: string | null = null;
let otaIsEmbeddedLaunch = true;
let otaCreatedAt: Date | null = null;
let otaIsUpdateAvailable = false;
let otaIsUpdatePending = false;
let otaCheckError: Error | null = null;
let otaDownloadError: Error | null = null;
let publicChannel: 'dev' | 'prod' = 'prod';
let muteHeadingFocusCalls = 0;

mock.module('expo-router', {
  exports: {
    Redirect: ({ href }: { href: string }) => createElement('Redirect', { href }),
    Slot: () => createElement(SlotRoute),
    Stack: () => createElement('Stack', null, createElement(SlotRoute)),
    usePathname: () => pathname,
    useRouter: () => ({
      dismissTo: (href: string) => dismissedToPaths.push(href),
      replace: (href: string) => replacedPaths.push(href),
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-updates', {
  exports: {
    useUpdates: () => ({
      checkError: otaCheckError,
      currentlyRunning: {
        createdAt: otaCreatedAt,
        isEmbeddedLaunch: otaIsEmbeddedLaunch,
        runtimeVersion: otaRuntimeVersion,
        updateId: otaUpdateId,
      },
      downloadError: otaDownloadError,
      isUpdateAvailable: otaIsUpdateAvailable,
      isUpdatePending: otaIsUpdatePending,
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  exports: { graphql: () => ({}) },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('react-native', {
  exports: {
    Platform: {
      get OS() {
        return platform;
      },
    },
    Pressable: ({ children, ...props }: Record<string, unknown>) =>
      createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : (children as ReactNode),
      ),
    ScrollView: ({ children, ...props }: Record<string, unknown>) =>
      createElement(platform === 'web' ? 'View' : 'ScrollView', props, children as ReactNode),
    StyleSheet: { create: <T>(styles: T) => styles, flatten: flattenStyle },
    Text: 'Text',
    useWindowDimensions: () => ({ width }),
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronLeftIcon: 'ChevronLeftIcon' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../PageHeader.tsx', import.meta.url), {
  exports: {
    PageHeader: (props: Record<string, unknown>) =>
      createElement('PageHeader', props, props.leading as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsNavigationList.tsx', import.meta.url), {
  exports: {
    SettingsNavigationList: (props: Record<string, unknown>) =>
      createElement('SettingsNavigationList', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./NativeChannelSettings.tsx', import.meta.url), {
  exports: { NativeChannelSettings: () => createElement('NativeChannelSettings') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsItem.tsx', import.meta.url), {
  exports: {
    SettingsItem: (props: Record<string, unknown>) => createElement('SettingsItem', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/StateView.tsx', import.meta.url), {
  exports: { StateView: (props: Record<string, unknown>) => createElement('StateView', props) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../config/public.ts', import.meta.url), {
  exports: {
    getPublicConfig: (key: string) => {
      if (key === 'channel') {
        return publicChannel;
      }
      throw new Error(`Unexpected public config key: ${key}`);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsLinkRow.tsx', import.meta.url), {
  exports: {
    SettingsLinkRow: (props: Record<string, unknown>) => createElement('SettingsLinkRow', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsProfileDetail.tsx', import.meta.url), {
  exports: {
    SettingsProfileDetail: () => createElement('SettingsProfileDetail'),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsProfileMigrationDetail.tsx', import.meta.url), {
  exports: {
    SettingsProfileMigrationDetail: () => createElement('SettingsProfileMigrationDetail'),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsFollowingImportDetail.tsx', import.meta.url), {
  exports: {
    SettingsFollowingImportDetail: () => createElement('SettingsFollowingImportDetail'),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./AccountDeletionScreen.tsx', import.meta.url), {
  exports: {
    AccountDeletionScreen: (props: Record<string, unknown>) =>
      createElement('AccountDeletionScreen', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../RouteBoundary.tsx', import.meta.url), {
  exports: {
    RouteBoundary: ({ loading }: { loading: ReactNode }) => loading,
    useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../session/logout.tsx', import.meta.url), {
  exports: {
    useAccountDeletionCleanup: () => ({ error: null, logout: () => undefined, pending: false }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsMuteAndBlockNavigation.tsx', import.meta.url), {
  exports: {
    SettingsMuteAndBlockNavigation: (props: Record<string, unknown>) =>
      createElement('SettingsMuteAndBlockNavigation', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsMutedProfiles.tsx', import.meta.url), {
  exports: {
    SettingsMutedProfiles: (props: Record<string, unknown>) =>
      createElement('SettingsMutedProfiles', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsBlockedProfiles.tsx', import.meta.url), {
  exports: {
    SettingsBlockedProfiles: (props: Record<string, unknown>) =>
      createElement('SettingsBlockedProfiles', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  exports: { useShellChrome: () => ({}) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useReducedMotion: () => false,
    useTheme: () => ({ border: '#333333', text: '#111111' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../Splash.tsx', import.meta.url), {
  exports: {
    Splash: (props: Record<string, unknown>) => createElement('Splash', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  exports: { useSession: () => ({ status: sessionStatus }) },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsDefaultPostVisibilityRoute: ComponentType;
let SettingsProfileMigrationRoute: ComponentType;
let SettingsFollowingImportRoute: ComponentType;
let SettingsProfileRoute: ComponentType;
let SettingsMuteAndBlockRoute: ComponentType;
let SettingsMutedProfilesRoute: ComponentType;
let SettingsBlockedProfilesRoute: ComponentType;
let SettingsAccountDeletionRoute: ComponentType;
let SettingsLayout: ComponentType;
let SettingsRoute: ComponentType;
let SettingsInfoRoute: ComponentType;
let SettingsDeveloperRoute: ComponentType;
let ProtectedLayout: ComponentType;
let WebRouteScrollContainer: ComponentType<RouteScrollContainerProps>;
let settingsInitialRouteName: string | undefined;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  const settingsLayoutModule = await import('../../app/(tabs)/(protected)/settings/_layout');
  SettingsLayout = settingsLayoutModule.default;
  settingsInitialRouteName = settingsLayoutModule.unstable_settings.initialRouteName;
  ({ RouteScrollContainer: WebRouteScrollContainer } =
    await import('../ui/RouteScrollContainer.web'));
  ({ default: SettingsRoute } = await import('../../app/(tabs)/(protected)/settings/index'));
  ({ default: SettingsInfoRoute } = await import('../../app/(tabs)/(protected)/settings/info'));
  ({ default: SettingsDeveloperRoute } =
    await import('../../app/(tabs)/(protected)/settings/developer'));
  ({ default: SettingsDefaultPostVisibilityRoute } =
    await import('../../app/(tabs)/(protected)/settings/default-post-visibility'));
  ({ default: SettingsProfileMigrationRoute } =
    await import('../../app/(tabs)/(protected)/settings/profile-migration'));
  ({ default: SettingsFollowingImportRoute } =
    await import('../../app/(tabs)/(protected)/settings/following-import'));
  ({ default: SettingsProfileRoute } =
    await import('../../app/(tabs)/(protected)/settings/profile'));
  ({ default: SettingsMuteAndBlockRoute } =
    await import('../../app/(tabs)/(protected)/settings/mute-and-block'));
  ({ default: SettingsMutedProfilesRoute } =
    await import('../../app/(tabs)/(protected)/settings/muted-profiles'));
  ({ default: SettingsBlockedProfilesRoute } =
    await import('../../app/(tabs)/(protected)/settings/blocked-profiles'));
  ({ default: SettingsAccountDeletionRoute } =
    await import('../../app/(tabs)/(protected)/settings/account-deletion'));
  ({ default: ProtectedLayout } = await import('../../app/(tabs)/(protected)/_layout'));
});

afterEach(async () => {
  platform = 'web';
  width = 1_280;
  dismissedToPaths = [];
  replacedPaths = [];
  pathname = '/settings';
  SlotRoute = () => null;
  sessionStatus = 'guest';
  otaUpdateId = null;
  otaRuntimeVersion = null;
  otaIsEmbeddedLaunch = true;
  otaCreatedAt = null;
  otaIsUpdateAvailable = false;
  otaIsUpdatePending = false;
  otaCheckError = null;
  otaDownloadError = null;
  publicChannel = 'prod';
  muteHeadingFocusCalls = 0;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('Settings routes', () => {
  it('RouteScrollContainer는 Web에서 style을 적용한 View를 렌더링한다', async () => {
    const webStyle: RouteScrollContainerProps['webStyle'] = { minWidth: 0, width: '100%' };
    await act(async () => {
      renderer = create(
        createElement(WebRouteScrollContainer, { webStyle }, createElement('RouteContent')),
      );
    });

    const view = rendered('View')[0];
    assert.ok(view);
    assert.deepEqual(view.props.style, webStyle);
    assert.equal(rendered('ScrollView').length, 0);
    assert.equal(rendered('RouteContent').length, 1);
  });

  it('Web detail deep link는 synthetic root anchor 없이 route-owned parent를 사용한다', () => {
    assert.equal(settingsInitialRouteName, undefined);
  });

  it('full Web root는 320px master와 flexible Profile detail을 함께 표시한다', async () => {
    await renderRoute('/settings', SettingsRoute);

    const workspace = byTestId('settings-workspace');
    assert.equal(workspace.props.style.flexDirection, 'row');
    assert.equal(flattenStyle(byTestId('settings-master-pane').props.style).width, 320);
    assert.equal(byTestId('settings-detail-pane').props.style.flex, 1);
    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '프로필 설정'],
    );
    const detailContainer = byTestId('settings-detail-pane')
      .findAll(
        (node) =>
          (node.type as unknown) === 'View' &&
          flattenStyle(node.props.style).minWidth === 0 &&
          flattenStyle(node.props.style).width === '100%' &&
          node.findAll((child) => (child.type as unknown) === 'PageHeader').length === 1 &&
          node.findAll((child) => (child.type as unknown) === 'SettingsProfileDetail').length === 1,
      )
      .at(-1);
    assert.ok(detailContainer);
    assert.equal(flattenStyle(detailContainer.props.style).minWidth, 0);
    assert.equal(flattenStyle(detailContainer.props.style).width, '100%');
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'profile');
    assert.equal(rendered('SettingsProfileDetail').length, 1);
  });

  it('full Web detail은 공통 master와 명시적인 parent back을 표시한다', async () => {
    await renderRoute('/settings/profile', SettingsProfileRoute);

    assert.ok(byTestId('settings-workspace'));
    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '프로필 설정'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'profile');
    assert.equal(
      rendered('PageHeader')[1].props.leading.props.accessibilityLabel,
      '설정으로 돌아가기',
    );
    assert.equal(rendered('SettingsProfileDetail').length, 1);
  });

  it('full Web migration detail은 공통 master의 migration item과 Settings parent back을 사용한다', async () => {
    await renderRoute('/settings/profile-migration', SettingsProfileMigrationRoute);

    assert.ok(byTestId('settings-workspace'));
    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '다른 서비스에서 이전'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'profile-migration');
    assert.equal(rendered('SettingsProfileMigrationDetail').length, 1);
    const back = rendered('PageHeader')[1].props.leading;
    assert.equal(back.props.accessibilityLabel, '설정으로 돌아가기');
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('full Web following import detail은 같은 master와 Settings parent back을 사용한다', async () => {
    await renderRoute('/settings/following-import', SettingsFollowingImportRoute);

    assert.ok(byTestId('settings-workspace'));
    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '팔로잉 가져오기'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'following-import');
    assert.equal(rendered('SettingsFollowingImportDetail').length, 1);
    const back = rendered('PageHeader')[1].props.leading;
    assert.equal(back.props.accessibilityLabel, '설정으로 돌아가기');
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('legacy default-post-visibility route redirects to the canonical profile settings route', async () => {
    pathname = '/settings/default-post-visibility';
    await act(async () => {
      renderer = create(createElement(SettingsDefaultPostVisibilityRoute));
    });

    const redirect = rendered('Redirect')[0];
    assert.ok(redirect);
    assert.equal(redirect.props.href, '/settings/profile');
  });

  it('full Web mute category는 master 진입점을 선택하고 상세에 하위 목록을 표시한다', async () => {
    await renderRoute('/settings/mute-and-block', SettingsMuteAndBlockRoute);

    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '뮤트 및 차단'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'mute-and-block');
    assert.equal(rendered('SettingsMuteAndBlockNavigation').length, 1);
    assert.equal(
      rendered('PageHeader')[1].props.leading.props.accessibilityLabel,
      '설정으로 돌아가기',
    );
  });

  it('full Web 코스모 탈퇴 detail은 마지막 master entry와 route heading을 선택한다', async () => {
    await renderRoute('/settings/account-deletion', SettingsAccountDeletionRoute);

    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '코스모 탈퇴'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'account-deletion');
    assert.equal(rendered('AccountDeletionScreen').length, 1);
    assert.equal(
      rendered('PageHeader')[1].props.leading.props.accessibilityLabel,
      '설정으로 돌아가기',
    );
  });

  it('full Web muted profile detail은 공통 master의 mute category를 선택한다', async () => {
    await renderRoute('/settings/muted-profiles', SettingsMutedProfilesRoute);

    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '뮤트한 프로필'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'mute-and-block');
    assert.equal(rendered('SettingsMuteAndBlockNavigation').length, 0);
    assert.equal(
      rendered('PageHeader')[1].props.leading.props.accessibilityLabel,
      '뮤트 및 차단으로 돌아가기',
    );
    assert.equal(
      byTestId('settings-detail-pane').findAll(
        (node) => (node.type as unknown) === 'SettingsMutedProfiles',
      ).length,
      1,
    );
    assert.equal(rendered('SettingsMutedProfiles').length, 1);
  });

  it('compact Web muted profile detail은 mute category parent로 dismiss한다', async () => {
    width = 768;
    await renderRoute('/settings/muted-profiles', SettingsMutedProfilesRoute);

    const back = rendered('PageHeader')[0].props.leading;
    assert.equal(back.props.accessibilityLabel, '뮤트 및 차단으로 돌아가기');
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings/mute-and-block']);
  });

  it('mobile Web 뮤트 해제 성공은 숨겨진 detail 제목으로 focus를 옮긴다', async () => {
    width = 390;
    await renderRoute('/settings/muted-profiles', SettingsMutedProfilesRoute);

    assert.equal(rendered('PageHeader').length, 0);
    const list = rendered('SettingsMutedProfiles')[0];
    assert.ok(list);
    await act(async () => list.props.onUnmuteSuccess());
    assert.equal(muteHeadingFocusCalls, 1);
  });

  it('Native muted profile detail은 mute category parent로 dismiss한다', async () => {
    platform = 'android';
    width = 390;
    await renderRoute('/settings/muted-profiles', SettingsMutedProfilesRoute);

    const back = rendered('Pressable').find(
      (node) => node.props.accessibilityLabel === '뮤트 및 차단으로 돌아가기',
    );
    assert.ok(back);
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings/mute-and-block']);
  });

  it('Native blocked profile detail은 header와 목록을 하나의 vertical ScrollView에 표시한다', async () => {
    platform = 'android';
    await renderRoute('/settings/blocked-profiles', SettingsBlockedProfilesRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    assert.equal(scrollView.findAll((node) => (node.type as unknown) === 'PageHeader').length, 1);
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'SettingsBlockedProfiles').length,
      1,
    );
  });

  it('full Web blocked profile deep link도 공통 master의 mute category를 선택한다', async () => {
    await renderRoute('/settings/blocked-profiles', SettingsBlockedProfilesRoute);

    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '차단한 프로필'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'mute-and-block');
    assert.equal(rendered('SettingsMuteAndBlockNavigation').length, 0);
    assert.equal(
      rendered('PageHeader')[1].props.leading.props.accessibilityLabel,
      '뮤트 및 차단으로 돌아가기',
    );
    assert.equal(rendered('SettingsBlockedProfiles').length, 1);
    assert.equal('headingRef' in rendered('SettingsBlockedProfiles')[0].props, false);
  });

  it('mobile Web blocked profile은 별도 heading focus 계약 없이 목록을 표시한다', async () => {
    width = 390;
    await renderRoute('/settings/blocked-profiles', SettingsBlockedProfilesRoute);

    assert.equal(rendered('PageHeader').length, 0);
    assert.equal('headingRef' in rendered('SettingsBlockedProfiles')[0].props, false);
  });

  it('compact Web root는 선택 없는 root 목록부터 표시한다', async () => {
    width = 768;
    await renderRoute('/settings', SettingsRoute);

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, undefined);
    assert.equal(rendered('SettingsProfileDetail').length, 0);
    const rootContainer = rendered('View')
      .filter(
        (node) =>
          flattenStyle(node.props.style).minWidth === 0 &&
          flattenStyle(node.props.style).width === '100%' &&
          node.findAll((child) => (child.type as unknown) === 'SettingsNavigationList').length ===
            1,
      )
      .at(-1);
    assert.ok(rootContainer);
    assert.equal(flattenStyle(rootContainer.props.style).minWidth, 0);
    assert.equal(flattenStyle(rootContainer.props.style).width, '100%');
  });

  it('mobile Web은 shell header를 중복하지 않고 root와 detail을 한 화면씩 표시한다', async () => {
    width = 390;
    await renderRoute('/settings', SettingsRoute);
    assert.equal(rendered('PageHeader').length, 0);
    assert.equal(rendered('SettingsNavigationList').length, 1);
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, undefined);

    await rerenderRoute('/settings/profile', SettingsProfileRoute);
    assert.equal(rendered('PageHeader').length, 0);
    assert.equal(rendered('SettingsNavigationList').length, 0);
    assert.equal(rendered('SettingsProfileDetail').length, 1);
    assert.equal(rendered('ScrollView').length, 0);

    await rerenderRoute('/settings/profile-migration', SettingsProfileMigrationRoute);
    assert.equal(rendered('PageHeader').length, 0);
    assert.equal(rendered('SettingsNavigationList').length, 0);
    assert.equal(rendered('SettingsProfileMigrationDetail').length, 1);
  });

  it('Native detail은 header부터 content까지 하나의 vertical ScrollView가 소유한다', async () => {
    platform = 'android';
    width = 320;
    await renderRoute('/settings/profile', SettingsProfileRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    assert.equal(scrollView.findAll((node) => (node.type as unknown) === 'PageHeader').length, 1);
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'SettingsProfileDetail').length,
      1,
    );
  });

  it('Android root는 선택 없는 Settings 목록부터 표시한다', async () => {
    platform = 'android';
    width = 390;
    await renderRoute('/settings', SettingsRoute);

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, undefined);
    assert.equal(rendered('SettingsProfileDetail').length, 0);
  });

  it('iOS detail은 back heading과 Profile content를 하나의 ScrollView에 표시한다', async () => {
    platform = 'ios';
    width = 390;
    await renderRoute('/settings/profile', SettingsProfileRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    const header = scrollView.findAll((node) => (node.type as unknown) === 'PageHeader')[0];
    assert.equal(header.props.title, '프로필 설정');
    assert.equal(header.props.leading.props.accessibilityLabel, '설정으로 돌아가기');
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'SettingsProfileDetail').length,
      1,
    );

    await act(async () => header.props.leading.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('iOS migration destination도 header와 content를 같은 ScrollView에 두고 Settings로 돌아간다', async () => {
    platform = 'ios';
    width = 390;
    await renderRoute('/settings/profile-migration', SettingsProfileMigrationRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    const header = scrollView.findAll((node) => (node.type as unknown) === 'PageHeader')[0];
    assert.equal(header.props.title, '다른 서비스에서 이전');
    assert.equal(header.props.leading.props.accessibilityLabel, '설정으로 돌아가기');
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'SettingsProfileMigrationDetail')
        .length,
      1,
    );

    await act(async () => header.props.leading.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('compact Web detail은 route-owned back header로 Settings root를 연다', async () => {
    width = 768;
    await renderRoute('/settings/profile', SettingsProfileRoute);

    const header = rendered('PageHeader')[0];
    assert.equal(header.props.title, '프로필 설정');
    const back = header.props.leading;
    assert.equal(back.props.accessibilityLabel, '설정으로 돌아가기');
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('compact Web 코스모 탈퇴 detail은 route-owned back header로 Settings root를 연다', async () => {
    width = 768;
    await renderRoute('/settings/account-deletion', SettingsAccountDeletionRoute);

    const header = rendered('PageHeader')[0];
    assert.equal(header.props.title, '코스모 탈퇴');
    const back = header.props.leading;
    assert.equal(back.props.accessibilityLabel, '설정으로 돌아가기');
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('Native 코스모 탈퇴 detail은 heading과 content를 하나의 ScrollView에 표시한다', async () => {
    platform = 'ios';
    width = 390;
    await renderRoute('/settings/account-deletion', SettingsAccountDeletionRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    const header = scrollView.findAll((node) => (node.type as unknown) === 'PageHeader')[0];
    assert.equal(header.props.title, '코스모 탈퇴');
    assert.equal(header.props.leading.props.accessibilityLabel, '설정으로 돌아가기');
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'AccountDeletionScreen').length,
      1,
    );

    await act(async () => header.props.leading.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('Android detail back action은 44dp layout과 hit slop으로 48dp target을 제공한다', async () => {
    platform = 'android';
    await renderRoute('/settings/profile', SettingsProfileRoute);

    const back = rendered('Pressable').find(
      (node) => node.props.accessibilityLabel === '설정으로 돌아가기',
    );
    assert.ok(back);
    const resolvedStyle =
      typeof back.props.style === 'function'
        ? back.props.style({ pressed: false })
        : back.props.style;
    const style = flattenStyle(resolvedStyle);
    assert.equal(style.height, 44);
    assert.equal(style.minHeight, 44);
    assert.equal(style.minWidth, 44);
    assert.equal(style.width, 44);
    assert.deepEqual(back.props.hitSlop, { bottom: 2, left: 2, right: 2, top: 2 });
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings']);
  });

  it('Native root는 route-owned 설정 heading을 표시한다', async () => {
    platform = 'ios';
    width = 1_024;
    await renderRoute('/settings', SettingsRoute);

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(rendered('SettingsNavigationList').length, 1);
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, undefined);
    assert.equal(rendered('SettingsProfileDetail').length, 0);
    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    assert.deepEqual(flattenStyle(scrollView.props.style), {
      flex: 1,
      minWidth: 0,
      width: '100%',
    });
    assert.deepEqual(flattenStyle(scrollView.props.contentContainerStyle), {
      flexGrow: 1,
      minWidth: 0,
      width: '100%',
    });
    assert.equal(scrollView.findAll((node) => (node.type as unknown) === 'PageHeader').length, 1);
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'SettingsNavigationList').length,
      1,
    );
  });

  it('정보 화면은 공개 정책과 개발 정보 진입점을 표시한다', async () => {
    platform = 'web';
    await renderRoute('/settings/info', SettingsInfoRoute);

    assert.deepEqual(
      rendered('SettingsLinkRow').map((node) => node.props.href),
      ['/privacy', '/account-deletion', '/child-safety', '/settings/developer'],
    );
    assert.equal(rendered('NativeChannelSettings').length, 0);
    assert.equal(rendered('SettingsItem').length, 0);
  });

  it('full Web 개발 정보는 정보 parent로 dismiss한다', async () => {
    await renderRoute('/settings/developer', SettingsDeveloperRoute);

    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'info');
    const back = rendered('PageHeader')[1].props.leading;
    assert.equal(back.props.accessibilityLabel, '정보로 돌아가기');
    await act(async () => back.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings/info']);
  });

  it('Web 개발 정보는 public channel만 표시하고 Native channel·OTA 행은 표시하지 않는다', async () => {
    platform = 'web';
    publicChannel = 'dev';
    await renderRoute('/settings/developer', SettingsDeveloperRoute);

    assert.equal(settingsItems().length, 1);
    assert.equal(settingsItem('채널').props.description, 'dev');
    assert.equal(rendered('NativeChannelSettings').length, 0);
    assert.deepEqual(rendered('SettingsLinkRow'), []);
  });

  it('Native 개발 정보는 OTA 진단 행을 렌더링하고 정보 parent로 돌아간다', async () => {
    platform = 'android';
    width = 390;
    otaUpdateId = '123e4567-e89b-12d3-a456-426614174000';
    otaRuntimeVersion = 'runtime-2026-09-16';
    otaIsEmbeddedLaunch = false;
    otaCreatedAt = new Date('2026-09-16T05:06:07.000Z');
    otaIsUpdateAvailable = true;
    otaIsUpdatePending = true;
    await renderRoute('/settings/developer', SettingsDeveloperRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    const header = scrollView.findAll((node) => (node.type as unknown) === 'PageHeader')[0];
    assert.equal(header.props.title, '개발 정보');
    assert.equal(header.props.leading.props.accessibilityLabel, '정보로 돌아가기');
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'NativeChannelSettings').length,
      1,
    );
    assert.equal(settingsItem('현재 업데이트 ID').props.description, otaUpdateId);
    assert.equal(settingsItem('런타임 버전').props.description, otaRuntimeVersion);
    assert.equal(settingsItem('실행 유형').props.description, 'OTA 업데이트');
    assert.equal(settingsItem('생성 시각').props.description, '2026-09-16T05:06:07.000Z');
    assert.match(
      String(settingsItem('업데이트 상태').props.description),
      /사용 가능: 예.*적용 대기: 예/,
    );

    await act(async () => header.props.leading.props.onPress());
    assert.deepEqual(dismissedToPaths, ['/settings/info']);
    assert.deepEqual(replacedPaths, []);
  });

  it('Native 개발 정보는 현재 값이 없을 때 식별 불가를 표시하고 오류 행은 조건부로 표시한다', async () => {
    platform = 'ios';
    width = 390;
    otaUpdateId = null;
    otaRuntimeVersion = null;
    otaCreatedAt = null;
    otaIsEmbeddedLaunch = true;
    await renderRoute('/settings/developer', SettingsDeveloperRoute);

    assert.equal(settingsItem('현재 업데이트 ID').props.description, '식별 불가');
    assert.equal(settingsItem('런타임 버전').props.description, '식별 불가');
    assert.equal(settingsItem('생성 시각').props.description, '식별 불가');
    assert.equal(
      settingsItems().some((node) => node.props.label === '업데이트 확인 오류'),
      false,
    );
    assert.equal(
      settingsItems().some((node) => node.props.label === '업데이트 다운로드 오류'),
      false,
    );

    otaRuntimeVersion = 'runtime-2026-09-16';
    otaIsEmbeddedLaunch = false;
    otaCheckError = new Error('check failed');
    otaDownloadError = new Error('download failed');
    await rerenderRoute('/settings/developer', SettingsDeveloperRoute);

    assert.equal(settingsItem('실행 유형').props.description, '식별 불가');
    assert.match(String(settingsItem('업데이트 확인 오류').props.description), /check failed/);
    assert.match(
      String(settingsItem('업데이트 다운로드 오류').props.description),
      /download failed/,
    );
  });
});

describe('Protected layout session guard', () => {
  it('guest는 onboarding으로 replace하면서 Splash를 유지한다', async () => {
    sessionStatus = 'guest';
    SlotRoute = () => createElement('ProtectedSlot');
    await act(async () => {
      renderer = create(createElement(ProtectedLayout));
    });

    assert.deepEqual(replacedPaths, ['/']);
    assert.equal(rendered('Splash').length, 1);
    assert.equal(rendered('Splash')[0].props.label, '로그인 상태를 확인하는 중입니다.');
    assert.equal(rendered('ProtectedSlot').length, 0);
  });

  it('valid·error 상태는 redirect하지 않고 Slot을 유지한다', async () => {
    for (const nextStatus of ['valid', 'error'] as const) {
      sessionStatus = nextStatus;
      replacedPaths = [];
      SlotRoute = () => createElement('ProtectedSlot');
      await act(async () => {
        renderer = create(createElement(ProtectedLayout));
      });

      assert.deepEqual(replacedPaths, []);
      assert.equal(rendered('Splash').length, 0);
      assert.equal(rendered('ProtectedSlot').length, 1);

      await act(async () => renderer?.unmount());
      renderer = null;
    }
  });
});

async function renderRoute(nextPathname: string, Route: ComponentType) {
  pathname = nextPathname;
  SlotRoute = Route;
  await act(async () => {
    renderer = create(createElement(SettingsLayout), {
      createNodeMock: ({ props }) =>
        (props as { testID?: string }).testID === 'mute-heading-focus'
          ? { focus: () => (muteHeadingFocusCalls += 1) }
          : null,
    });
  });
  assert.ok(renderer);
}

async function rerenderRoute(nextPathname: string, Route: ComponentType) {
  assert.ok(renderer);
  pathname = nextPathname;
  SlotRoute = Route;
  await act(async () => renderer?.update(createElement(SettingsLayout)));
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.find(
    (node) => (node.type as unknown) === 'View' && node.props.testID === testID,
  );
}

function settingsItems(): ReactTestInstance[] {
  return rendered('SettingsItem');
}

function settingsItem(label: string): ReactTestInstance {
  const item = settingsItems().find((node) => node.props.label === label);
  assert.ok(item, `SettingsItem with label ${label} was not rendered`);
  return item;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style as Record<string, unknown>);
}
