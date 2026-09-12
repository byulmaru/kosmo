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
let pendingNavigationAction: (() => void) | undefined;
let shouldDeferNavigation: boolean;
const requestNavigation = mock.fn((action: () => void) => {
  pendingNavigationAction = action;
  return shouldDeferNavigation;
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
      unreadNotificationCount: 3,
    },
  };
  logoutError = '로그아웃하지 못했습니다.';
  logoutPending = true;
  presentationProps = undefined;
  logout.mock.resetCalls();
  pendingNavigationAction = undefined;
  requestNavigation.mock.resetCalls();
  shouldDeferNavigation = true;
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

test('Production adapter defers guarded logout until the captured action runs', async () => {
  const props = await renderSidebar();

  assert.equal(props.logoutError, logoutError);
  assert.equal(props.logoutPending, true);
  assert.equal(props.showFeedback, true);
  assert.equal(props.unreadNotificationCount, 3);

  props.onLogout();
  assert.equal(requestNavigation.mock.callCount(), 1);
  assert.equal(logout.mock.callCount(), 0);
  assert.equal(pendingNavigationAction, logout);
  pendingNavigationAction?.();
  assert.equal(logout.mock.callCount(), 1);
});

test('Production adapter logs out immediately when the guard does not defer', async () => {
  shouldDeferNavigation = false;
  const props = await renderSidebar();

  props.onLogout();
  assert.equal(logout.mock.callCount(), 1);
});

test('Production adapter hides feedback without a current session', async () => {
  currentSession = null;
  const props = await renderSidebar();

  assert.equal(props.showFeedback, false);
});
