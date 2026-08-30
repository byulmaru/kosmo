import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as BottomTabBarModule from './BottomTabBar';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PressableProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

const PressableHost = ({ children, ...props }: PressableProps) =>
  createElement('Pressable', props, typeof children === 'function' ? null : children);

mockModule('react-native', {
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => false,
  useTheme: () => ({
    accent: 'accent',
    backgroundCanvas: 'canvas',
    borderSubtle: 'subtle',
    foregroundPrimary: 'primary',
    foregroundSecondary: 'secondary',
    stateDisabledForeground: 'disabled',
    stateFocusRing: 'focus',
    stateHover: 'hover',
    statePressed: 'pressed',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  radius: { full: 999 },
  space: { 4: 4 },
  textStyles: { uiLabelS: {} },
});
mockModule(new URL('./Avatar', import.meta.url), {
  Avatar: () => createElement('Avatar'),
});
mockModule(new URL('./BottomTabBarIcon', import.meta.url), {
  BottomTabBarIcon: () => createElement('BottomTabBarIcon'),
});

let bottomTabBarModule: typeof BottomTabBarModule | undefined;

before(async () => {
  bottomTabBarModule = await import('./BottomTabBar');
});

afterEach(() => {
  mock.restoreAll();
});

test('Native BottomTabBar exposes selected state on selected and unselected controls', async () => {
  assert.ok(bottomTabBarModule);
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      createElement(bottomTabBarModule!.BottomTabBar, {
        currentDestination: 'home',
        onNavigate: () => undefined,
        platform: 'ios',
        profile: { label: '프로필' },
      }),
    );
  });

  assert.ok(renderer);
  const tabs = renderer.root.findAllByType(PressableHost);
  const selected = tabs.find((tab) => tab.props.accessibilityLabel === '홈');
  const unselected = tabs.find((tab) => tab.props.accessibilityLabel === '검색');
  assert.ok(selected);
  assert.ok(unselected);
  assert.deepEqual(selected.props.accessibilityState, { disabled: false, selected: true });
  assert.deepEqual(unselected.props.accessibilityState, { disabled: false, selected: false });

  await act(async () => renderer?.unmount());
});
