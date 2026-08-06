import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back' | 'canGoBack' | 'replace'>;

export function returnToSettingsRoot(router: SettingsNavigationRouter) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/settings');
}
