import { breakpoints } from '@/theme/tokens';

export const webMobileShellHeaderHeight = 64;

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

  const segments = pathname.split('/').filter(Boolean);
  if (
    segments.length === 2 &&
    pathname !== '/login/callback' &&
    segments[1] !== 'followers' &&
    segments[1] !== 'following'
  ) {
    return { leading: 'back', title: '게시글' };
  }

  return null;
}

export function getWebMobileShellHeaderStickyOffset(width: number) {
  return width < breakpoints.compact ? webMobileShellHeaderHeight : 0;
}
