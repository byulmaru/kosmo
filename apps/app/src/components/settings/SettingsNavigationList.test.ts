import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

mock.module('expo-router', {
  exports: {
    Link: ({ children, href }: { children: ReactElement; href: string }) =>
      createElement('Link', { href }, cloneElement(children, { href } as never)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    Platform: { OS: 'web' },
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
  pathname?: string;
  selected?: 'default-post-visibility' | 'mute-and-block' | 'info' | 'account-deletion';
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
    assert.equal(links[3].props.accessibilityLabel, '정보 설정 열기');
    assert.equal(links[3].props.href, '/settings/info');
    assert.equal(links[4].props.accessibilityLabel, '코스모 탈퇴 설정 열기');
    assert.equal(links[4].props.href, '/settings/account-deletion');
  });

  it('현재 path와 같은 root detail만 page-current 상태를 받는다', async () => {
    await render({
      pathname: '/settings/default-post-visibility',
      selected: 'default-post-visibility',
    });

    const internal = rendered('Pressable')[1];
    assert.equal(internal.props['aria-current'], 'page');
    assert.deepEqual(internal.props.accessibilityState, { selected: true });
  });

  it('root detail을 visual selected로 표시해도 root path에서는 current page가 아니다', async () => {
    await render({ pathname: '/settings', selected: 'default-post-visibility' });

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

  it('개발 정보 route에서도 정보 category는 선택 상태만 유지한다', async () => {
    await render({ pathname: '/settings/developer', selected: 'info' });

    const info = rendered('Pressable')[3];
    assert.equal(info.props['aria-current'], undefined);
    assert.deepEqual(info.props.accessibilityState, { selected: true });
  });

  it('코스모 탈퇴는 마지막 root destination으로 current 상태를 전달한다', async () => {
    await render({ pathname: '/settings/account-deletion', selected: 'account-deletion' });

    const deletion = rendered('Pressable')[4];
    assert.equal(deletion.props['aria-current'], 'page');
    assert.deepEqual(deletion.props.accessibilityState, { selected: true });
  });
});

async function render(
  props: {
    pathname?: string;
    selected?: 'default-post-visibility' | 'mute-and-block' | 'info' | 'account-deletion';
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
