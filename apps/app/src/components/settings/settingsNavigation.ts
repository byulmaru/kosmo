import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'dismissTo'>;

function getSettingsParentPath(pathname: string) {
  return pathname === '/settings/muted-profiles' || pathname === '/settings/blocked-profiles'
    ? '/settings/mute-and-block'
    : pathname === '/settings/developer' || pathname === '/settings/open-source-licenses'
      ? '/settings/info'
      : '/settings';
}

export function returnToSettingsParent(pathname: string, router: SettingsNavigationRouter) {
  router.dismissTo(getSettingsParentPath(pathname));
}
