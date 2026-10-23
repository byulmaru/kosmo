import { breakpoints } from '@/theme/tokens';
import { getProfileConnectionKind } from '../profile/route';

export const webMobileShellHeaderHeight = 64;

export function getProfileEditActionTargetMetrics(platform: string) {
  if (platform === 'ios') {
    return { height: 44, top: 152 } as const;
  }
  if (platform === 'android') {
    return { height: 48, top: 150 } as const;
  }

  return { height: 32, top: 158 } as const;
}

export function getProfileEditActionCurrentState(pathname: string) {
  const selected = pathname === '/profile-edit';

  return {
    accessibilityState: { selected },
    ariaCurrent: selected ? ('page' as const) : undefined,
  };
}

export function getShellLayout(web: boolean, width: number) {
  if (!web || width < breakpoints.compact) {
    return 'mobile';
  }

  return width < breakpoints.full ? 'compact' : 'full';
}

// Coachmark lifecycle keys must use the layout viewport so scroll locking cannot
// restart the guide when the scrollbar changes the document client width.
export function getTimelineGuideViewportWidth(web: boolean, width: number) {
  if (!web || typeof window === 'undefined' || !Number.isFinite(window.innerWidth)) {
    return width;
  }

  return window.innerWidth;
}

export type WebMobileShellHeader = Readonly<{
  leading: 'back' | 'menu';
  title:
    | '타임라인 둘러보기'
    | '게시글'
    | '프로필 설정'
    | '다른 서비스에서 이전'
    | '팔로잉 가져오기'
    | '뮤트 및 차단'
    | '뮤트한 프로필'
    | '차단한 프로필'
    | '테마'
    | '설정'
    | '개발 정보'
    | '알림'
    | '정보';
}>;

export function isSettingsRoute(pathname: string) {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

export function isTimelineRoute(pathname: string) {
  return pathname === '/home' || pathname === '/local' || pathname === '/federated';
}

export function isNativeDrawerSwipeEnabled(pathname: string) {
  return isTimelineRoute(pathname) || pathname === '/search' || pathname === '/notifications';
}

export function getShellRoutePresentation(web: boolean, width: number, pathname: string) {
  const layout = getShellLayout(web, width);
  const settingsWorkspace = layout === 'full' && isSettingsRoute(pathname);
  const retiredComposeRoute = pathname === '/compose';

  return {
    layout,
    settingsWorkspace,
    showRightRail: layout === 'full' && !settingsWorkspace && !retiredComposeRoute,
  } as const;
}

export function getWebMobileShellHeader(
  web: boolean,
  width: number,
  pathname: string,
  routeSegments: readonly string[],
  guestPublicContent = false,
): WebMobileShellHeader | null {
  if (!web || getShellLayout(web, width) !== 'mobile') {
    return null;
  }

  if (pathname === '/' && guestPublicContent) return { leading: 'menu', title: '타임라인 둘러보기' };
  if (pathname === '/notifications') return { leading: 'menu', title: '알림' };
  if (pathname === '/settings') return { leading: 'menu', title: '설정' };

  const settingsTitles: Record<string, WebMobileShellHeader['title']> = {
    '/settings/profile': '프로필 설정',
    '/settings/default-post-visibility': '프로필 설정',
    '/settings/profile-migration': '다른 서비스에서 이전',
    '/settings/following-import': '팔로잉 가져오기',
    '/settings/mute-and-block': '뮤트 및 차단',
    '/settings/muted-profiles': '뮤트한 프로필',
    '/settings/blocked-profiles': '차단한 프로필',
    '/settings/theme': '테마',
    '/settings/info': '정보',
    '/settings/developer': '개발 정보',
  };
  if (settingsTitles[pathname]) return { leading: 'back', title: settingsTitles[pathname] };
  if (routeSegments.at(-2) === '[profileHandle]' && routeSegments.at(-1) === '[postId]') {
    return { leading: guestPublicContent ? 'menu' : 'back', title: '게시글' };
  }
  return null;
}

export function isWebMobileRouteOwnedHeader(web: boolean, width: number, pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const isProfileHome =
    segments.length === 1 && (segments[0]?.length ?? 0) > 1 && segments[0]?.startsWith('@');
  const isReactionPeopleRoute = segments.length === 3 && segments[2] === 'reactions';

  return (
    web &&
    getShellLayout(web, width) === 'mobile' &&
    (pathname === '/search' ||
      pathname === '/profile-edit' ||
      isProfileHome ||
      isReactionPeopleRoute ||
      getProfileConnectionKind(pathname) !== null)
  );
}

export function getWebMobileShellHeaderStickyOffset(width: number) {
  return width < breakpoints.compact ? webMobileShellHeaderHeight : 0;
}
