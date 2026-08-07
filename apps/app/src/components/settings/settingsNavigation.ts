import { Platform } from 'react-native';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back'>;

export function returnToSettingsRoot(router: SettingsNavigationRouter) {
  if (Platform.OS === 'web') {
    globalThis.location.replace('/settings');
  } else {
    router.back();
  }
}
