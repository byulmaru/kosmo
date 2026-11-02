import { Platform } from 'react-native';

export function readBannerDismissal(key: string) {
  if (Platform.OS !== 'web') {
    return false;
  }

  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeBannerDismissal(key: string) {
  if (Platform.OS !== 'web') {
    return;
  }

  try {
    globalThis.localStorage?.setItem(key, '1');
  } catch {
    // Keep the banner dismissed for this mount when browser storage is unavailable.
  }
}
