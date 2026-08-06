import { breakpoints } from '@/theme/tokens';

export const webMobileShellHeaderHeight = 64;

export function getSidebarNavigationItemHeight(platform: string) {
  return platform === 'android' ? 48 : 45;
}

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

export const profileEditActionLabelColor = '#111111';

export function getShellLayout(web: boolean, width: number) {
  if (!web || width < breakpoints.compact) {
    return 'mobile';
  }

  return width < breakpoints.full ? 'compact' : 'full';
}

export type WebMobileShellHeader = Readonly<{
  leading: 'back' | 'menu';
  title: '게시글' | '글쓰기' | '알림';
}>;

export function getWebMobileShellHeader(
  web: boolean,
  width: number,
  pathname: string,
  routeSegments: readonly string[],
): WebMobileShellHeader | null {
  if (!web || getShellLayout(web, width) !== 'mobile') {
    return null;
  }

  if (pathname === '/compose') {
    return { leading: 'menu', title: '글쓰기' };
  }
  if (pathname === '/notifications') {
    return { leading: 'menu', title: '알림' };
  }

  if (routeSegments.at(-2) === '[profileHandle]' && routeSegments.at(-1) === '[postId]') {
    return { leading: 'back', title: '게시글' };
  }

  return null;
}

export function getWebMobileShellHeaderStickyOffset(width: number) {
  return width < breakpoints.compact ? webMobileShellHeaderHeight : 0;
}
