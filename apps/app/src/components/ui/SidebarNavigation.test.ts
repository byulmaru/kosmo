import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SidebarNavigation as SidebarNavigationExport } from './SidebarNavigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let renderer: ReactTestRenderer | undefined;
let SidebarNavigation: typeof SidebarNavigationExport;

function MockPressable({ children, ...props }: { children?: unknown; [key: string]: unknown }) {
  const content =
    typeof children === 'function' ? (children as (state: object) => unknown)({}) : children;
  return createElement('Pressable', props, content as never);
}

mockModule('expo-router', {
  Link: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Link', props, children as never),
});
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web' },
  Pressable: MockPressable,
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => style,
  },
  Text: 'Text',
  View: 'View',
});
mockModule(require.resolve('lucide-react-native'), {
  Bell: 'Bell',
  Bookmark: 'Bookmark',
  ChevronDown: 'ChevronDown',
  ChevronUp: 'ChevronUp',
  Ellipsis: 'Ellipsis',
  House: 'House',
  LogIn: 'LogIn',
  LogOut: 'LogOut',
  Mail: 'Mail',
  Search: 'Search',
  Settings: 'Settings',
  Smartphone: 'Smartphone',
  SquarePen: 'SquarePen',
  UserRound: 'UserRound',
  UserRoundPlus: 'UserRoundPlus',
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => false,
  useTheme: () => ({
    actionPrimaryBase: '#000',
    actionPrimaryHover: '#111',
    actionPrimaryOnBase: '#fff',
    actionPrimaryPressed: '#222',
    backgroundCanvas: '#fff',
    backgroundElevated: '#fff',
    borderSubtle: '#ddd',
    danger: '#f00',
    foregroundPrimary: '#111',
    foregroundSecondary: '#333',
    stateDisabledForeground: '#777',
    stateDisabledSurface: '#eee',
    stateFocusRing: '#00f',
    stateHover: '#eee',
    statePressed: '#ddd',
    stateSelectedSurface: '#ddd',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  iconSizes: { 20: 20, 24: 24 },
  motion: { duration: { fast: 100, instant: 0 }, easing: { standard: 'linear' } },
  radius: { 8: 8, full: 999 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16, 24: 24 },
  textStyles: { uiCopyL: {}, uiLabelL: {}, uiLabelM: {}, uiLabelS: {} },
});
mockModule('./ActionMenu', {
  ActionMenu: () => createElement('ActionMenu'),
});
mockModule('./Avatar', { Avatar: () => createElement('Avatar') });
mockModule('./IconButton', { getIconButtonHitSlop: () => 0 });
mockModule('./interactionTarget', { getInteractionTargetSize: () => 44 });
mockModule('./navigationChrome', {
  getUnreadNotificationAccessibilityLabel: () => '알림',
});

before(async () => {
  ({ SidebarNavigation } = await import('./SidebarNavigation'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  mock.restoreAll();
});

async function renderGuestSidebar(presentation: 'compact' | 'drawer' | 'full') {
  await act(async () => {
    renderer = create(
      createElement(SidebarNavigation, {
        guestPublicContent: true,
        onLogout: () => undefined,
        onNavigate: () => undefined,
        presentation,
        renderGuestAction: ({ action, children }) =>
          createElement('GuestActionLink', { action }, children),
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

describe('guest public-content sidebar', () => {
  it('offers separate signup and login links without protected navigation or logout', async () => {
    const view = await renderGuestSidebar('full');
    const guestActions = view.root.findAllByType('GuestActionLink' as never);
    const labels = view.root
      .findAllByType('Pressable' as never)
      .map((node) => node.props.accessibilityLabel);

    assert.deepEqual(
      guestActions.map((node) => node.props.action),
      ['signup', 'login'],
    );
    assert.ok(labels.includes('가입하기'));
    assert.ok(labels.includes('로그인'));
    assert.ok(!labels.includes('홈'));
    assert.ok(!labels.includes('설정 및 기타'));
    assert.ok(!labels.includes('로그아웃'));
  });

  it('keeps both compact actions discoverable by their accessible names', async () => {
    const view = await renderGuestSidebar('compact');
    const labels = view.root
      .findAllByType('Pressable' as never)
      .map((node) => node.props.accessibilityLabel);

    assert.ok(labels.includes('가입하기'));
    assert.ok(labels.includes('로그인'));
    assert.equal(view.root.findAllByType('GuestActionLink' as never).length, 2);
  });
});
