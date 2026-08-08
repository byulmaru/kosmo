import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'replace'>;

export function returnToSettingsRoot(router: SettingsNavigationRouter) {
  router.replace('/settings');
}
