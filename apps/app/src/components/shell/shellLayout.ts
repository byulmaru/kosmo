import { breakpoints } from '@/theme/tokens';

export const webMobileShellHeaderHeight = 65;

export function getShellLayout(web: boolean, width: number) {
  if (!web || width < breakpoints.compact) {
    return 'mobile';
  }

  return width < breakpoints.full ? 'compact' : 'full';
}

export function getShellMobileHeaderStickyOffset(web: boolean, width: number) {
  return web && getShellLayout(web, width) === 'mobile' ? webMobileShellHeaderHeight : 0;
}
