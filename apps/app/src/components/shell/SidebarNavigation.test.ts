import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SidebarNavigationProps as PresentationProps } from '@/components/ui/SidebarNavigation';
import type { SidebarNavigation as SidebarNavigationExport } from './SidebarNavigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

let currentSession: { selectedProfile: Record<string, unknown> } | null;
let logoutError: string | null;
let logoutPending: boolean;
let presentationProps: PresentationProps | undefined;
let renderer: ReactTestRenderer | undefined;
const logout = mock.fn();
const requestNavigation = mock.fn((action: () => void) => {
  void action;
  return false;
});

mockModule('expo-router', { usePathname: () => '/home' });
mockModule('react-native', {
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: () => ({ currentSession }),
});
mockModule('@/components/ui/SidebarNavigation', {
  SidebarNavigation: (props: PresentationProps) => {
    presentationProps = props;
    return createElement('SidebarNavigationPresentation');
  },
});
mockModule('@/session/logout', {
  useLogout: () => ({ error: logoutError, logout, pending: logoutPending }),
});
mockModule(new URL('./NavigationGuardContext.tsx', import.meta.url), {
  useNavigationGuard: () => ({ request: requestNavigation }),
});
mockModule(new URL('./NavigationLink.tsx', import.meta.url), {
  NavigationLink: ({ children }: { children: ReactNode }) => children,
});
mockModule(new URL('./ProfileSwitcher.tsx', import.meta.url), {
  ProfileSwitcher: () => null,
});
mockModule(new URL('./shellLayout.ts', import.meta.url), {
  isSettingsRoute: () => false,
  isTimelineRoute: () => true,
});
mockModule(new URL('./UnreadNotificationBadgeController.tsx', import.meta.url), {
  useUnreadNotificationCount: () => 3,
});

let SidebarNavigation: typeof SidebarNavigationExport;

before(async () => {
  ({ SidebarNavigation } = await import('./SidebarNavigation'));
});

beforeEach(() => {
  currentSession = {
    selectedProfile: {
      avatar: null,
      displayName: '테스트 프로필',
      id: 'profile-test',
      relativeHandle: '@test',
    },
  };
  logoutError = '로그아웃하지 못했습니다.';
  logoutPending = true;
  presentationProps = undefined;
  logout.mock.resetCalls();
  requestNavigation.mock.resetCalls();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

async function renderSidebar() {
  await act(async () => {
    renderer = create(createElement(SidebarNavigation, { query: {} as never }));
  });
  assert.ok(presentationProps);
  return presentationProps;
}

test('Production adapter owns logout state and guard composition', async () => {
  const props = await renderSidebar();

  assert.equal(props.logoutError, logoutError);
  assert.equal(props.logoutPending, true);
  assert.equal(props.showFeedback, true);

  props.onLogout();
  assert.equal(requestNavigation.mock.callCount(), 1);
  assert.equal(requestNavigation.mock.calls[0]?.arguments[0], logout);
  assert.equal(logout.mock.callCount(), 1);
});

test('Production adapter hides feedback without a current session', async () => {
  currentSession = null;
  const props = await renderSidebar();

  assert.equal(props.showFeedback, false);
});
