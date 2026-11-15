import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import UniversalShellQueryArtifact from '../shell/__generated__/UniversalShellQuery.graphql';
import { ShellChromeProvider } from '../shell/ShellChromeContext';
import { getSettingsMenuSelection } from './settingsNavigation';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { UniversalShellQuery$data } from '../shell/__generated__/UniversalShellQuery.graphql';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
let platform: 'android' | 'ios' | 'web' = 'web';
let navigationPath = '/settings';
let openSettingsCalls = 0;
let openSettingsFailure = false;
let permission: { granted: boolean; status?: 'denied' | 'granted' | 'undetermined' } = {
  granted: true,
  status: 'granted',
};
let permissionStatusCalls = 0;
let requestPermissionAndSyncCalls = 0;
let webPushConfigAvailable = false;
let webPushPermissionContextAvailable = false;
let browserPushSupport:
  | 'checking'
  | 'installation-required'
  | 'supported'
  | 'unsupported'
  | 'unavailable' = 'supported';
let browserNotificationPermission: NotificationPermission = 'default';
let requestedBrowserNotificationPermission: NotificationPermission = 'granted';
let browserNotificationRequestPromise: Promise<NotificationPermission> | null = null;
let browserNotificationRequestThrows = false;
let browserNotificationRequestCalls = 0;
let syncWebPermissionCalls: NotificationPermission[] = [];
let requestPermissionAndSync: () => Promise<void> = async () => {
  requestPermissionAndSyncCalls += 1;
};
const toastCalls: Array<{ message: string; tone: string }> = [];
const originalNotificationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Notification');
let openProfileSwitcherCalls = 0;

mock.module('react-relay', {
  exports: {
    ...ReactRelay,
    graphql: (parts: TemplateStringsArray) => {
      const name = parts.join('').match(/(?:fragment|query|mutation) (\w+)/)?.[1];
      assert.ok(name);
      const generatedPath =
        name === 'ProfileListItemRow_profile'
          ? `../profile/__generated__/${name}.graphql.ts`
          : `./__generated__/${name}.graphql.ts`;
      return require(generatedPath).default;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('expo-router', {
  exports: {
    Link: ({ children, href }: { children: ReactElement; href: string }) =>
      createElement('Link', { href }, cloneElement(children, { href } as never)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/config/public', {
  exports: {
    getPublicConfig: (key: string) =>
      key === 'webPush' && webPushConfigAvailable
        ? {
            apiKey: 'api-key',
            appId: 'app-id',
            messagingSenderId: 'sender-id',
            projectId: 'project-id',
            vapidKey: 'vapid-key',
          }
        : undefined,
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
    Animated: { View: 'AnimatedView' },
    Platform: {
      get OS() {
        return platform;
      },
    },
    Pressable: ({
      children,
      ...props
    }: {
      children?: ReactNode | ((state: { hovered: boolean; pressed: boolean }) => ReactNode);
      [key: string]: unknown;
    }) =>
      createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ hovered: false, pressed: false }) : children,
      ),
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
    },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/useAnimatedColorTransition.ts', import.meta.url), {
  exports: {
    useAnimatedColorTransition: ({ color }: { color: string }) => color,
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
mock.module(new URL('../native-push/nativePushPermissionContext.ts', import.meta.url), {
  exports: {
    useRequestNativePushPermissionAndSync: () => requestPermissionAndSync,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../native-push/webPushPermissionContext.ts', import.meta.url), {
  exports: {
    useWebPushPermission: () => {
      if (!webPushPermissionContextAvailable) {
        throw new Error('Web Push provider is unavailable.');
      }
      return {
        permission: browserNotificationPermission,
        support: browserPushSupport,
        requestPermission: () =>
          Notification.requestPermission().then((permission) => {
            syncWebPermissionCalls.push(permission);
            browserNotificationPermission = permission;
          }),
      };
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: {
    ChevronDownIcon: 'ChevronDownIcon',
    ChevronRightIcon: 'ChevronRightIcon',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  exports: {
    NavigationLink: ({
      children,
      href,
      onNavigate,
    }: {
      children: ReactElement<{
        onClick?: (event: unknown) => void;
        onPress?: (event: unknown) => void;
      }>;
      href: string;
      onNavigate?: () => void;
    }) => {
      const onActivate = (event: unknown) => {
        if (platform === 'web') {
          children.props.onClick?.(event);
        } else {
          children.props.onPress?.(event);
        }
        onNavigate?.();
        navigationPath = href;
      };

      return createElement(
        'NavigationLink',
        { href },
        cloneElement(
          children,
          platform === 'web'
            ? ({ href, onClick: onActivate } as never)
            : ({ href, onPress: onActivate } as never),
        ),
      );
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/Button.tsx', import.meta.url), {
  exports: {
    Button: ({ children, ...props }: Record<string, unknown>) =>
      createElement('Pressable', { accessibilityRole: 'button', ...props }, children as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/Avatar.tsx', import.meta.url), {
  exports: {
    Avatar: (props: Record<string, unknown>) => createElement('Avatar', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsItem.tsx', import.meta.url), {
  exports: {
    SettingsItem: (props: Record<string, unknown>) =>
      createElement('SettingsItem', props, createElement('Text', null, props.label as string)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/LoadingIndicator.tsx', import.meta.url), {
  exports: { LoadingIndicator: 'ActivityIndicator' },
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
      foregroundSecondary: 'foreground-secondary',
      foregroundPrimary: '#111111',
      borderDefault: '#dddddd',
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
  density?: 'default' | 'compact';
  pathname?: string;
  selected?:
    | 'profile'
    | 'profile-migration'
    | 'mute-and-block'
    | 'theme'
    | 'natural-language-mute'
    | 'info'
    | 'account-deletion';
}>;
let renderer: ReactTestRenderer | null = null;
let environment: Environment | null = null;
let selectedProfile: NonNullable<
  NonNullable<UniversalShellQuery$data['currentSession']>['selectedProfile']
> | null = null;
let shellChromeAvailable = false;

before(async () => {
  ({ SettingsNavigationList } = await import('./SettingsNavigationList'));
});

afterEach(async () => {
  platform = 'web';
  navigationPath = '/settings';
  openSettingsCalls = 0;
  openSettingsFailure = false;
  permission = { granted: true, status: 'granted' };
  permissionStatusCalls = 0;
  requestPermissionAndSyncCalls = 0;
  requestPermissionAndSync = async () => {
    requestPermissionAndSyncCalls += 1;
  };
  webPushConfigAvailable = false;
  webPushPermissionContextAvailable = false;
  browserPushSupport = 'supported';
  browserNotificationPermission = 'default';
  requestedBrowserNotificationPermission = 'granted';
  browserNotificationRequestPromise = null;
  browserNotificationRequestThrows = false;
  browserNotificationRequestCalls = 0;
  syncWebPermissionCalls = [];
  if (originalNotificationDescriptor) {
    Object.defineProperty(globalThis, 'Notification', originalNotificationDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'Notification');
  }
  toastCalls.length = 0;
  openProfileSwitcherCalls = 0;
  environment = null;
  selectedProfile = null;
  shellChromeAvailable = false;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsNavigationList', () => {
  it('그룹의 각 direct destination으로 이동하면 현재 route가 표시된다', async () => {
    await renderAtPath('/settings');

    assert.deepEqual(
      rendered('Text')
        .filter((node) => node.props.accessibilityRole === 'header')
        .map((node) => node.children[0]),
      ['프로필', '앱', '계정'],
    );
    const destinations = rendered('Pressable')
      .filter((node) =>
        typeof node.props.href === 'string' ? node.props.href.startsWith('/settings/') : false,
      )
      .map((node) => node.props.href);
    assert.deepEqual(destinations, [
      '/settings/profile',
      '/settings/mute-and-block',
      '/settings/profile-migration',
      '/settings/natural-language-mute',
      '/settings/theme',
      '/settings/account-deletion',
      '/settings/info',
    ]);

    for (const href of destinations) {
      assert.equal(typeof href, 'string');
      const destination = rendered('Pressable').find((node) => node.props.href === href);
      assert.ok(destination, `Missing direct destination ${href}`);
      assert.equal(destination.props.accessibilityRole, 'link');

      const activate = platform === 'web' ? destination.props.onClick : destination.props.onPress;
      assert.equal(typeof activate, 'function');
      await act(async () => activate());
      assert.equal(navigationPath, href);
      await rerenderAtPath(navigationPath);

      const activeDestination = rendered('Pressable').find((node) => node.props.href === href);
      assert.ok(activeDestination);
      assert.equal(activeDestination.props['aria-current'], 'page');
      assert.deepEqual(activeDestination.props.accessibilityState, { selected: true });

      navigationPath = '/settings';
      await rerenderAtPath(navigationPath);
    }
  });

  it('compact density를 모든 navigation row와 Native notification item에 전달한다', async () => {
    platform = 'ios';
    await render({ density: 'compact' });

    const items = rendered('SettingsItem');
    assert.ok(items.length > 0);
    assert.equal(
      items.every((item) => item.props.density === 'compact'),
      true,
    );
    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'native-notification-settings',
    );
    assert.ok(notification);
    assert.equal(items.find((item) => item.props.label === '알림 설정')?.props.density, 'compact');
  });

  it('Byulmaru ID는 기존 canonical external link와 새 탭 동작을 유지한다', async () => {
    await render();

    const account = rendered('Pressable').find(
      (node) => node.props.testID === 'byulmaru-id-account-settings-entry',
    );
    assert.ok(account);
    assert.equal(account.props.accessibilityLabel, '별마루 ID 계정 설정 외부 서비스로 이동');
    assert.equal(account.props.href, 'https://id.byulmaru.co');
    assert.deepEqual(account.props.hrefAttrs, {
      rel: 'noopener noreferrer',
      target: '_blank',
    });
  });

  it('UniversalShell Relay fragment identity를 표시하고 기존 Profile picker를 연다', async () => {
    await renderWithSelectedProfile();

    const picker = rendered('Pressable').find(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        node.findAll((child) => (child.type as unknown) === 'Avatar').length === 1,
    );
    assert.ok(picker);
    assert.match(
      String(picker.props.accessibilityLabel),
      /현재 Profile.*@current.*다른 Profile 선택/,
    );
    assert.equal(picker.props.accessibilityRole, 'button');
    assert.deepEqual(
      picker.findAll((node) => (node.type as unknown) === 'Text').map((node) => node.children[0]),
      ['현재 Profile', '@current'],
    );
    const chevron = picker.findAll((node) => (node.type as unknown) === 'ChevronDownIcon')[0];
    assert.ok(chevron);
    assert.equal(chevron.parent?.props.accessibilityElementsHidden, true);
    assert.equal(chevron.parent?.props.pointerEvents, 'none');
    assert.equal(
      rendered('Text').some((node) => node.children[0] === 'Profile 전환'),
      false,
    );

    await act(async () => picker.props.onPress());
    assert.equal(openProfileSwitcherCalls, 1);
  });

  it('Web Push config가 없으면 provider 없이 설정 목록을 렌더링한다', async () => {
    webPushConfigAvailable = false;
    webPushPermissionContextAvailable = false;

    await render();

    assert.ok(rendered('Pressable').length > 0);
    assert.deepEqual(syncWebPermissionCalls, []);
  });

  it('브라우저 권한 요청을 press 중 먼저 시작하고 허용 결과를 provider에 전달한다', async () => {
    webPushConfigAvailable = true;
    webPushPermissionContextAvailable = true;
    exposeBrowserNotification();
    let resolvePermission!: (permission: NotificationPermission) => void;
    browserNotificationRequestPromise = new Promise((resolve) => {
      resolvePermission = resolve;
    });
    await render();

    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'web-notification-settings',
    );
    assert.ok(notification);

    await act(async () => {
      notification.props.onPress();
      assert.equal(browserNotificationRequestCalls, 1);
      assert.deepEqual(syncWebPermissionCalls, []);
      resolvePermission('granted');
      await browserNotificationRequestPromise;
    });

    assert.deepEqual(syncWebPermissionCalls, ['granted']);
    assert.equal(requestPermissionAndSyncCalls, 0);
    assert.deepEqual(toastCalls, []);
  });

  it('브라우저 권한 요청이 동기적으로 실패하면 재시도 안내를 표시한다', async () => {
    webPushConfigAvailable = true;
    webPushPermissionContextAvailable = true;
    browserNotificationRequestThrows = true;
    exposeBrowserNotification();
    await render();

    let notification = rendered('Pressable').find(
      (node) => node.props.testID === 'web-notification-settings',
    );
    assert.ok(notification);

    await act(async () => notification?.props.onPress());
    assert.equal(browserNotificationRequestCalls, 1);
    assert.deepEqual(syncWebPermissionCalls, []);
    assert.deepEqual(toastCalls, [
      {
        message: '브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.',
        tone: 'danger',
      },
    ]);

    browserNotificationRequestThrows = false;
    notification = rendered('Pressable').find(
      (node) => node.props.testID === 'web-notification-settings',
    );
    assert.ok(notification);
    await act(async () => notification?.props.onPress());
    assert.equal(browserNotificationRequestCalls, 2);
    assert.deepEqual(syncWebPermissionCalls, ['granted']);
  });

  it('허용된 권한 상태에서는 동기화를 재시도할 수 있다', async () => {
    webPushConfigAvailable = true;
    webPushPermissionContextAvailable = true;
    browserNotificationPermission = 'granted';
    exposeBrowserNotification();
    await render();

    const notification = rendered('Pressable').find(
      (node) => node.props.testID === 'web-notification-settings',
    );
    assert.ok(notification);

    await act(async () => notification.props.onPress());

    assert.equal(browserNotificationRequestCalls, 1);
    assert.deepEqual(syncWebPermissionCalls, ['granted']);
  });

  it('거부된 권한은 상태와 브라우저 설정 안내로 표시한다', async () => {
    webPushConfigAvailable = true;
    webPushPermissionContextAvailable = true;
    browserNotificationPermission = 'denied';
    exposeBrowserNotification();
    await render();

    assert.equal(
      rendered('Pressable').some((node) => node.props.testID === 'web-notification-settings'),
      false,
    );
    assert.equal(browserNotificationRequestCalls, 0);
    assert.deepEqual(syncWebPermissionCalls, []);
  });

  it('Firebase가 브라우저를 지원하지 않으면 권한 action을 숨긴다', async () => {
    webPushConfigAvailable = true;
    webPushPermissionContextAvailable = true;
    browserPushSupport = 'unsupported';
    await render();

    assert.equal(
      rendered('Pressable').some((node) => node.props.testID === 'web-notification-settings'),
      false,
    );
    assert.equal(browserNotificationRequestCalls, 0);
  });

  it('홈 화면 앱 설치가 필요한 상태에서는 권한 action을 요청하지 않는다', async () => {
    webPushConfigAvailable = true;
    webPushPermissionContextAvailable = true;
    browserPushSupport = 'installation-required';
    await render();

    assert.equal(
      rendered('Pressable').some((node) => node.props.testID === 'web-notification-settings'),
      false,
    );
    assert.equal(browserNotificationRequestCalls, 0);
    assert.deepEqual(syncWebPermissionCalls, []);
  });

  it('권한이 이미 허용됐으면 OS 알림 설정을 연다', async () => {
    platform = 'ios';
    await render();

    const rows = rendered('Pressable');
    const notificationIndex = rows.findIndex(
      (node) => node.props.testID === 'native-notification-settings',
    );
    const notification = rows[notificationIndex];

    const themeIndex = rows.findIndex((node) => node.props.href === '/settings/theme');
    assert.equal(notificationIndex, themeIndex + 1);
    assert.equal(notification?.props.accessibilityLabel, 'OS 알림 설정 열기');
    assert.equal(notification?.props.accessibilityRole, 'button');
    const notificationItem = rendered('SettingsItem').find(
      (node) => node.props.label === '알림 설정',
    );
    assert.ok(notificationItem);
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
    const trailing = rendered('SettingsItem').find((node) => node.props.label === '알림 설정')
      ?.props.trailing;
    assert.equal(trailing?.type, 'ActivityIndicator');
    assert.equal(trailing?.props.color, 'foreground-secondary');
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

    const internal = rendered('Pressable').find((node) => node.props.href === '/settings/profile');
    assert.ok(internal);
    assert.equal(internal.props['aria-current'], 'page');
    assert.deepEqual(internal.props.accessibilityState, { selected: true });
  });

  it('migration route는 현재·선택 상태를 표시한다', async () => {
    await render({ pathname: '/settings/profile-migration', selected: 'profile-migration' });

    const migration = rendered('Pressable').find(
      (link) => link.props.href === '/settings/profile-migration',
    );
    assert.ok(migration);
    assert.equal(migration.props['aria-current'], 'page');
    assert.deepEqual(migration.props.accessibilityState, { selected: true });
  });

  it('legacy following import path는 canonical migration row의 현재·선택 상태를 사용한다', async () => {
    await render({ pathname: '/settings/following-import', selected: 'profile-migration' });

    const migration = rendered('Pressable').find(
      (link) => link.props.href === '/settings/profile-migration',
    );
    assert.ok(migration);
    assert.equal(migration.props['aria-current'], 'page');
    assert.deepEqual(migration.props.accessibilityState, { selected: true });
  });

  it('root detail을 visual selected로 표시해도 root path에서는 current page가 아니다', async () => {
    await render({ pathname: '/settings', selected: 'profile' });

    const profileSettings = rendered('Pressable').find(
      (node) => node.props.href === '/settings/profile',
    );
    assert.ok(profileSettings);
    assert.equal(profileSettings.props['aria-current'], undefined);
    assert.deepEqual(profileSettings.props.accessibilityState, { selected: true });
  });

  it('차단 프로필 route에서도 뮤트 및 차단 category는 선택 상태만 유지한다', async () => {
    await render({ pathname: '/settings/blocked-profiles', selected: 'mute-and-block' });

    const muteAndBlock = rendered('Pressable').find(
      (link) => link.props.href === '/settings/mute-and-block',
    );
    assert.ok(muteAndBlock);
    assert.equal(muteAndBlock.props['aria-current'], undefined);
    assert.deepEqual(muteAndBlock.props.accessibilityState, { selected: true });
  });

  it('테마 경로의 메뉴는 현재 페이지와 선택 상태를 표시한다', async () => {
    await render({ pathname: '/settings/theme', selected: 'theme' });
    const theme = rendered('Pressable').find((link) => link.props.href === '/settings/theme')!;
    assert.equal(theme.props.accessibilityLabel, '화면 설정 열기, 시스템');
    assert.equal(theme.props['aria-current'], 'page');
    assert.deepEqual(theme.props.accessibilityState, { selected: true });
  });

  it('개발 정보 route에서도 정보 category는 선택 상태만 유지한다', async () => {
    await render({ pathname: '/settings/developer', selected: 'info' });

    const info = rendered('Pressable').find((link) => link.props.href === '/settings/info')!;
    assert.equal(info.props['aria-current'], undefined);
    assert.deepEqual(info.props.accessibilityState, { selected: true });
  });

  it('코스모 탈퇴 destination은 현재 페이지와 선택 상태를 표시한다', async () => {
    await render({ pathname: '/settings/account-deletion', selected: 'account-deletion' });

    const deletion = rendered('Pressable').find(
      (link) => link.props.href === '/settings/account-deletion',
    );
    assert.ok(deletion);
    assert.equal(deletion.props['aria-current'], 'page');
    assert.deepEqual(deletion.props.accessibilityState, { selected: true });
  });
});

async function render(
  props: {
    density?: 'default' | 'compact';
    pathname?: string;
    selected?:
      | 'profile'
      | 'profile-migration'
      | 'mute-and-block'
      | 'theme'
      | 'natural-language-mute'
      | 'info'
      | 'account-deletion';
  } = {},
) {
  environment ??= createTestEnvironment();
  await act(async () => {
    renderer = create(createNavigationTree(props));
  });
  assert.ok(renderer);
}

async function renderAtPath(pathname: string) {
  navigationPath = pathname;
  await render({ pathname, selected: getSettingsMenuSelection(pathname) });
}

async function rerenderAtPath(pathname: string) {
  navigationPath = pathname;
  assert.ok(renderer);
  await act(async () => {
    renderer?.update(
      createNavigationTree({ pathname, selected: getSettingsMenuSelection(pathname) }),
    );
  });
}

async function renderWithSelectedProfile() {
  environment = createTestEnvironment();
  const shellQuery = createOperationDescriptor(getRequest(UniversalShellQueryArtifact), {});
  environment.commitPayload(shellQuery, {
    currentSession: {
      id: 'session:settings-navigation',
      selectedProfile: {
        __typename: 'Profile',
        avatar: null,
        displayName: '현재 Profile',
        id: 'profile:settings-navigation',
        relativeHandle: '@current',
      },
    },
    me: { profiles: [] },
  });

  // Read the fragment reference produced by the real UniversalShell query and Relay Store.
  selectedProfile =
    (environment.lookup(shellQuery.fragment).data as UniversalShellQuery$data).currentSession
      ?.selectedProfile ?? null;
  assert.ok(selectedProfile);
  shellChromeAvailable = true;
  await render({ pathname: '/settings' });
}

function createTestEnvironment() {
  return new Environment({
    network: Network.create(() => Observable.create<GraphQLResponse>(() => undefined)),
    store: new Store(new RecordSource()),
  });
}

function createNavigationTree(props: {
  density?: 'default' | 'compact';
  pathname?: string;
  selected?:
    | 'profile'
    | 'profile-migration'
    | 'mute-and-block'
    | 'theme'
    | 'natural-language-mute'
    | 'info'
    | 'account-deletion';
}) {
  const navigation = createElement(SettingsNavigationList, props);
  const content = shellChromeAvailable
    ? createElement(ShellChromeProvider, {
        navigationDrawerOpen: false,
        openNavigationDrawer: () => undefined,
        openProfileSwitcher: () => {
          openProfileSwitcherCalls += 1;
        },
        registerHomeReselection: () => () => undefined,
        reselectHome: () => undefined,
        selectedProfile,
        children: navigation,
      })
    : navigation;

  assert.ok(environment);
  return createElement(ReactRelay.RelayEnvironmentProvider, { children: content, environment });
}

function exposeBrowserNotification() {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: {
      get permission() {
        return browserNotificationPermission;
      },
      requestPermission: () => {
        browserNotificationRequestCalls += 1;
        if (browserNotificationRequestThrows) {
          throw new Error('permission request failed');
        }
        return (
          browserNotificationRequestPromise ??
          Promise.resolve(requestedBrowserNotificationPermission)
        );
      },
    } as unknown as typeof Notification,
  });
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
