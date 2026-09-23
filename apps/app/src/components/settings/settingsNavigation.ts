import { Platform } from 'react-native';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'replace'>;

export function returnToSettingsParent(pathname: string, router: SettingsNavigationRouter) {
  const parentPath =
    pathname === '/settings/muted-profiles' || pathname === '/settings/blocked-profiles'
      ? '/settings/mute-and-block'
      : pathname === '/settings/developer'
        ? '/settings/info'
        : '/settings';

  if (Platform.OS === 'web') {
    globalThis.location.replace(parentPath);
  } else {
    router.replace(parentPath);
  }
}
