import { breakpoints } from '@/theme/tokens';

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

export function isSettingsRoute(pathname: string) {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

export function isTimelineRoute(pathname: string) {
  return pathname === '/home' || pathname === '/local';
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
