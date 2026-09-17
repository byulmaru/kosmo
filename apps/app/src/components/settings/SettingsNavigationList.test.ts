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
        return Promise.resolve();
      },
    },
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
    SettingsItem: (props: Record<string, unknown>) => createElement('SettingsItem', props),
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

let SettingsNavigationList: ComponentType<{
  selected?: 'default-post-visibility';
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
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsNavigationList', () => {
  it('실제 데이터가 연결된 설정 진입점만 제공한다', async () => {
    await render();

    const links = rendered('Pressable');
    assert.equal(
      links[0].props.accessibilityLabel,
      'Byulmaru ID Account Settings 외부 서비스로 이동',
    );
    assert.equal(links[0].props.href, 'https://id.byulmaru.co');
    assert.equal(links[1].props.accessibilityLabel, '게시물 기본 공개 범위 설정 열기');
    assert.equal(links[1].props.href, '/settings/default-post-visibility');
    assert.equal(links[2].props.accessibilityLabel, '뮤트 및 차단 설정 열기');
    assert.equal(links[2].props.href, '/settings/mute-and-block');
    assert.equal(
      rendered('Pressable').some((node) => node.props.testID === 'native-notification-settings'),
      false,
    );
  });

  it('Native는 뮤트 및 차단 뒤에 OS 알림 설정 action을 표시하고 OS 설정을 연다', async () => {
    platform = 'ios';
    await render();

    const rows = rendered('Pressable');
    const muteIndex = rows.findIndex(
      (node) => node.props.accessibilityLabel === '뮤트 및 차단 설정 열기',
    );
    const notificationIndex = rows.findIndex(
      (node) => node.props.testID === 'native-notification-settings',
    );
    const infoIndex = rows.findIndex(
      (node) => node.props.accessibilityLabel === '정보 설정 열기',
    );
    const notification = rows[notificationIndex];

    assert.equal(notificationIndex, muteIndex + 1);
    assert.equal(infoIndex, notificationIndex + 1);
    assert.equal(notification?.props.accessibilityLabel, 'OS 알림 설정 열기');
    assert.equal(notification?.props.accessibilityRole, 'button');
    const notificationItem = rendered('SettingsItem').find(
      (node) => node.props.label === '알림 설정',
    );
    assert.ok(notificationItem);
    assert.equal(notificationItem.props.label, '알림 설정');
    assert.equal(
      notificationItem.props.description,
      '기기의 알림 설정에서 Push 알림을 관리할 수 있어요.',
    );

    await act(async () => notification?.props.onPress());
    assert.equal(openSettingsCalls, 1);
  });

  it('full master가 표시한 내부 detail만 current destination으로 전달한다', async () => {
    await render('default-post-visibility');

    const internal = rendered('Pressable')[1];
    assert.equal(internal.props['aria-current'], 'page');
    assert.deepEqual(internal.props.accessibilityState, { selected: true });
  });
});

async function render(selected?: 'default-post-visibility') {
  await act(async () => {
    renderer = create(createElement(SettingsNavigationList, { selected }));
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
