import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
let platform: 'android' | 'ios' | 'web' = 'web';
let openSettingsCalls = 0;
let openSettingsFailure = false;
let permission: { granted: boolean; status?: 'denied' | 'granted' | 'undetermined' } = {
  granted: true,
  status: 'granted',
};
let permissionStatusCalls = 0;
let requestPermissionAndSyncCalls = 0;
let migrationEnabled = false;
let requestPermissionAndSync: () => Promise<void> = async () => {
  requestPermissionAndSyncCalls += 1;
};
const toastCalls: Array<{ message: string; tone: string }> = [];

mock.module('expo-router', {
  exports: {
    Link: ({ children, href }: { children: ReactElement; href: string }) =>
      createElement('Link', { href }, cloneElement(children, { href } as never)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    Linking: {
      openSettings: () => {
        openSettingsCalls += 1;
        return openSettingsFailure
          ? Promise.reject(new Error('settings unavailable'))
          : Promise.resolve();
      },
    },
    ActivityIndicator: 'ActivityIndicator',
    Platform: {
      get OS() {
        return platform;
      },
    },
    Pressable: 'Pressable',
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
    },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../native-push/nativePushClient.ts', import.meta.url), {
  exports: {
    getNativeNotificationPermissionStatus: () => {
      permissionStatusCalls += 1;
      return Promise.resolve(permission);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../FeatureFlagsContext.tsx', import.meta.url), {
  exports: { useFeatureFlag: (key: string) => key === 'profile-migration' && migrationEnabled },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../native-push/nativePushPermissionContext.ts', import.meta.url), {
  exports: {
    useRequestNativePushPermissionAndSync: () => requestPermissionAndSync,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronRightIcon: 'ChevronRightIcon' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  exports: {
    NavigationLink: ({ children, href }: { children: ReactElement; href: string }) =>
      createElement('NavigationLink', { href }, cloneElement(children, { href } as never)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsItem.tsx', import.meta.url), {
  exports: {
    SettingsItem: (props: Record<string, unknown>) =>
      createElement('SettingsItem', props, createElement('Text', null, props.label as string)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useReducedMotion: () => false,
    useTheme: () => ({
      divider: '#eeeeee',
      focus: '#005fcc',
      selectedBorder: '#9a7800',
      selectedSurface: '#fff8dc',
      stateHover: '#f4f4f4',
      statePressed: '#e8e8e8',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  exports: {
    useToast: () => ({
      showToast: (message: string, options: { tone: string }) => {
        toastCalls.push({ message, tone: options.tone });
        return () => undefined;
      },
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsNavigationList: ComponentType<{
  pathname?: string;
  selected?:
    | 'profile'
    | 'profile-migration'
    | 'following-import'
    | 'mute-and-block'
    | 'theme'
    | 'info'
    | 'account-deletion';
}>;
let SettingsMuteAndBlockNavigation: ComponentType<{
  selected?: 'blocked-profiles' | 'muted-profiles';
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsNavigationList } = await import('./SettingsNavigationList'));
  ({ SettingsMuteAndBlockNavigation } = await import('./SettingsMuteAndBlockNavigation'));
});

describe('SettingsMuteAndBlockNavigation', () => {
  it('기존 뮤트와 차단 관리 destination을 이 순서로 직접 연결한다', async () => {
    await act(async () => {
      renderer = create(createElement(SettingsMuteAndBlockNavigation));
    });
    assert.ok(renderer);

    const links = rendered('Pressable');
    assert.deepEqual(
      links.map((link) => ({ label: link.props.accessibilityLabel, href: link.props.href })),
      [
        { label: '뮤트한 프로필 관리 열기', href: '/settings/muted-profiles' },
        { label: '차단한 프로필 관리 열기', href: '/settings/blocked-profiles' },
      ],
    );
    assert.deepEqual(texts(), ['뮤트한 프로필', '차단한 프로필']);
  });
});

afterEach(async () => {
  platform = 'web';
  openSettingsCalls = 0;
  openSettingsFailure = false;
  permission = { granted: true, status: 'granted' };
  permissionStatusCalls = 0;
  requestPermissionAndSyncCalls = 0;
  requestPermissionAndSync = async () => {
    requestPermissionAndSyncCalls += 1;
  };
  migrationEnabled = false;
  toastCalls.length = 0;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsNavigationList', () => {
  it('실제 데이터가 연결된 설정 진입점만 제공한다', async () => {
    migrationEnabled = true;
    await render();

    const links = rendered('Pressable');
    assert.equal(
      links[0].props.accessibilityLabel,
      'Byulmaru ID Account Settings 외부 서비스로 이동',
    );
    assert.equal(links[0].props.href, 'https://id.byulmaru.co');
    assert.equal(links[1].props.accessibilityLabel, '프로필 설정 열기');
    assert.equal(links[1].props.href, '/settings/profile');
    assert.equal(links[2].props.accessibilityLabel, '다른 서비스에서 이전 설정 열기');
    assert.equal(links[2].props.href, '/settings/profile-migration');
    assert.equal(links[3].props.accessibilityLabel, '팔로잉 가져오기 설정 열기');
    assert.equal(links[3].props.href, '/settings/following-import');
    assert.ok(texts().includes('팔로잉 가져오기'));
    assert.equal(links[4].props.accessibilityLabel, '뮤트 및 차단 설정 열기');
    assert.equal(links[4].props.href, '/settings/mute-and-block');
    assert.equal(links[5].props.accessibilityLabel, '테마 설정 열기, 시스템');
    assert.equal(links[5].props.href, '/settings/theme');
    assert.equal(links[6].props.accessibilityLabel, '정보 설정 열기');
    assert.equal(links[6].props.href, '/settings/info');
    assert.equal(links[7].props.accessibilityLabel, '코스모 탈퇴 설정 열기');
    assert.equal(links[7].props.href, '/settings/account-deletion');
    assert.equal(
      links.some((node) => node.props.testID === 'native-notification-settings'),
      false,
    );
  });

  it('migration feature flag가 꺼져 있으면 Settings root에 진입점을 노출하지 않는다', async () => {
    await render();

    assert.equal(
      rendered('Pressable').some((node) => node.props.href === '/settings/profile-migration'),
      false,
    );
    assert.equal(
      rendered('Pressable').some((node) => node.props.href === '/settings/following-import'),
      false,
    );
  });

  it('권한이 이미 허용됐으면 OS 알림 설정을 연다', async () => {
    platform = 'ios';
    await render();

    const rows = rendered('Pressable');
    const muteIndex = rows.findIndex(
      (node) => node.props.accessibilityLabel === '뮤트 및 차단 설정 열기',
    );
    const notificationIndex = rows.findIndex(
      (node) => node.props.testID === 'native-notification-settings',
    );
    const infoIndex = rows.findIndex((node) => node.props.accessibilityLabel === '정보 설정 열기');
    const notification = rows[notificationIndex];

    assert.equal(notificationIndex, muteIndex + 1);
    const themeIndex = rows.findIndex((node) => node.props.href === '/settings/theme');
    assert.equal(themeIndex, notificationIndex + 1);
    assert.equal(infoIndex, themeIndex + 1);
    assert.equal(notification?.props.accessibilityLabel, 'OS 알림 설정 열기');
    assert.equal(notification?.props.accessibilityRole, 'button');
    const notificationItem = rendered('SettingsItem').find(
      (node) => node.props.label === '알림 설정',
    );
    assert.ok(notificationItem);
    assert.equal(
      notificationItem.props.description,
      '기기의 알림 설정에서 Push 알림을 관리할 수 있어요.',
    );

    await act(async () => notification?.props.onPress());
    assert.equal(openSettingsCalls, 1);
    assert.equal(permissionStatusCalls, 1);
    assert.equal(requestPermissionAndSyncCalls, 0);
    assert.deepEqual(toastCalls, []);
  });

  it('권한이 거부됐으면 OS 알림 설정을 연다', async () => {
    platform = 'android';
    permission = { granted: false, status: 'denied' };
    await render();

    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.ok(notification);

    await act(async () => notification.props.onPress());

    assert.equal(openSettingsCalls, 1);
    assert.equal(requestPermissionAndSyncCalls, 0);
  });

  it('아직 권한을 묻지 않았으면 OS 권한 요청과 동기화를 시작한다', async () => {
    platform = 'ios';
    permission = { granted: false, status: 'undetermined' };
    await render();

    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.ok(notification);

    await act(async () => notification.props.onPress());

    assert.equal(permissionStatusCalls, 1);
    assert.equal(requestPermissionAndSyncCalls, 1);
    assert.equal(openSettingsCalls, 0);
    assert.deepEqual(toastCalls, []);
  });

  it('OS 설정 열기가 실패하면 사용자에게 오류를 표시한다', async () => {
    platform = 'android';
    permission = { granted: false, status: 'denied' };
    openSettingsFailure = true;
    await render();

    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.ok(notification);

    await act(async () => notification.props.onPress());

    assert.equal(openSettingsCalls, 1);
    assert.deepEqual(toastCalls, [
      {
        message: '기기의 알림 설정을 열지 못했어요. 잠시 후 다시 시도해 주세요.',
        tone: 'danger',
      },
    ]);
  });

  it('권한 요청 또는 token 동기화가 실패하면 재시도 안내를 표시한다', async () => {
    platform = 'ios';
    permission = { granted: false, status: 'undetermined' };
    requestPermissionAndSync = async () => {
      requestPermissionAndSyncCalls += 1;
      throw new Error('token sync failed');
    };
    await render();

    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.ok(notification);

    await act(async () => notification.props.onPress());

    assert.equal(requestPermissionAndSyncCalls, 1);
    assert.deepEqual(toastCalls, [
      {
        message: '알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.',
        tone: 'danger',
      },
    ]);
  });

  it('권한 action이 pending인 동안 중복 press를 막고 진행 상태를 표시한다', async () => {
    platform = 'ios';
    permission = { granted: false, status: 'undetermined' };
    let signalRequestStarted!: () => void;
    let finishRequest!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      signalRequestStarted = resolve;
    });
    requestPermissionAndSync = () => {
      requestPermissionAndSyncCalls += 1;
      signalRequestStarted();
      return new Promise<void>((resolve) => {
        finishRequest = resolve;
      });
    };
    await render();

    let notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.ok(notification);
    await act(async () => {
      notification?.props.onPress();
      await requestStarted;
    });

    notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.equal(notification?.props.disabled, true);
    assert.equal(
      rendered('SettingsItem').find((node) => node.props.label === '알림 설정')?.props.trailing
        .type,
      'ActivityIndicator',
    );
    await act(async () => notification?.props.onPress());
    assert.equal(requestPermissionAndSyncCalls, 1);

    await act(async () => finishRequest());
    notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.equal(notification?.props.disabled, false);
    assert.equal(
      rendered('SettingsItem').find((node) => node.props.label === '알림 설정')?.props.trailing,
      null,
    );
  });

  it('현재 path와 같은 root detail만 page-current 상태를 받는다', async () => {
    await render({
      pathname: '/settings/profile',
      selected: 'profile',
    });

    const internal = rendered('Pressable')[1];
    assert.equal(internal.props['aria-current'], 'page');
    assert.deepEqual(internal.props.accessibilityState, { selected: true });
  });

  it('migration route는 feature flag가 켜졌을 때 현재·선택 상태를 표시한다', async () => {
    migrationEnabled = true;
    await render({ pathname: '/settings/profile-migration', selected: 'profile-migration' });

    const migration = rendered('Pressable').find(
      (link) => link.props.href === '/settings/profile-migration',
    );
    assert.ok(migration);
    assert.equal(migration.props['aria-current'], 'page');
    assert.deepEqual(migration.props.accessibilityState, { selected: true });
  });

  it('following import route는 같은 feature flag 아래 현재·선택 상태를 표시한다', async () => {
    migrationEnabled = true;
    await render({ pathname: '/settings/following-import', selected: 'following-import' });

    const followingImport = rendered('Pressable').find(
      (link) => link.props.href === '/settings/following-import',
    );
    assert.ok(followingImport);
    assert.equal(followingImport.props['aria-current'], 'page');
    assert.deepEqual(followingImport.props.accessibilityState, { selected: true });
  });

  it('root detail을 visual selected로 표시해도 root path에서는 current page가 아니다', async () => {
    await render({ pathname: '/settings', selected: 'profile' });

    const profileSettings = rendered('Pressable')[1];
    assert.equal(profileSettings.props['aria-current'], undefined);
    assert.deepEqual(profileSettings.props.accessibilityState, { selected: true });
  });

  it('차단 프로필 route에서도 뮤트 및 차단 category는 선택 상태만 유지한다', async () => {
    await render({ pathname: '/settings/blocked-profiles', selected: 'mute-and-block' });

    const muteAndBlock = rendered('Pressable')[2];
    assert.equal(muteAndBlock.props['aria-current'], undefined);
    assert.deepEqual(muteAndBlock.props.accessibilityState, { selected: true });
  });

  it('테마 경로의 메뉴는 현재 페이지와 선택 상태를 표시한다', async () => {
    await render({ pathname: '/settings/theme', selected: 'theme' });
    const theme = rendered('Pressable').find((link) => link.props.href === '/settings/theme')!;
    assert.equal(theme.props.accessibilityLabel, '테마 설정 열기, 시스템');
    assert.equal(theme.props['aria-current'], 'page');
    assert.deepEqual(theme.props.accessibilityState, { selected: true });
  });

  it('개발 정보 route에서도 정보 category는 선택 상태만 유지한다', async () => {
    await render({ pathname: '/settings/developer', selected: 'info' });

    const info = rendered('Pressable').find((link) => link.props.href === '/settings/info')!;
    assert.equal(info.props['aria-current'], undefined);
    assert.deepEqual(info.props.accessibilityState, { selected: true });
  });

  it('코스모 탈퇴는 마지막 root destination으로 current 상태를 전달한다', async () => {
    await render({ pathname: '/settings/account-deletion', selected: 'account-deletion' });

    const links = rendered('Pressable');
    const deletion = links[links.length - 1];
    assert.equal(deletion.props['aria-current'], 'page');
    assert.deepEqual(deletion.props.accessibilityState, { selected: true });
  });
});

async function render(
  props: {
    pathname?: string;
    selected?:
      | 'profile'
      | 'profile-migration'
      | 'following-import'
      | 'mute-and-block'
      | 'theme'
      | 'info'
      | 'account-deletion';
  } = {},
) {
  await act(async () => {
    renderer = create(createElement(SettingsNavigationList, props));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}
