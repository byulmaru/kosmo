import { Platform } from 'react-native';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back'>;
type NestedSettingsNavigationRouter = Pick<ImperativeRouter, 'replace'>;

export function returnToSettingsRoot(router: SettingsNavigationRouter) {
  if (Platform.OS === 'web') {
    globalThis.location.replace('/settings');
  } else {
    router.back();
  }
}

export function returnToMuteAndBlockRoot(router: NestedSettingsNavigationRouter) {
  if (Platform.OS === 'web') {
    globalThis.location.replace('/settings/mute-and-block');
  } else {
    router.replace('/settings/mute-and-block');
  }
}
