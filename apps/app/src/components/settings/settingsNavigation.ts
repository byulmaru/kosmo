import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'dismissTo'>;

function getSettingsParentPath(pathname: string) {
  if (pathname === '/settings/natural-language-mute') {
    return '/settings/labs';
  }
  if (pathname === '/settings/muted-profiles' || pathname === '/settings/blocked-profiles') {
    return '/settings/mute-and-block';
  }
  if (pathname === '/settings/developer' || pathname === '/settings/licenses') {
    return '/settings/info';
  }
  return '/settings';
}

export function returnToSettingsParent(pathname: string, router: SettingsNavigationRouter) {
  router.dismissTo(getSettingsParentPath(pathname));
}
