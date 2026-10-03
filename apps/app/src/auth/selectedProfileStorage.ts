import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const NATIVE_KEY = 'kosmo.selected-profile';
const WEB_KEY = 'kosmo:selected-profile';

type StoredSelectedProfile = {
  profileId: string;
};

export async function readSelectedProfile(): Promise<string | null> {
  const serialized = await readSerialized();
  if (!serialized) {
    return null;
  }

  try {
    const value = JSON.parse(serialized) as Partial<StoredSelectedProfile>;
    if (typeof value.profileId !== 'string' || value.profileId.length === 0) {
      return null;
    }

    return value.profileId;
  } catch {
    return null;
  }
}

export async function writeSelectedProfile(profileId: string): Promise<void> {
  if (!profileId) {
    return;
  }

  const serialized = JSON.stringify({ profileId } satisfies StoredSelectedProfile);

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(WEB_KEY, serialized);
    } catch {
      // Preserve the authenticated session when browser storage is unavailable or blocked.
    }
    return;
  }

  await SecureStore.setItemAsync(NATIVE_KEY, serialized).catch(() => undefined);
}

export async function deleteSelectedProfile(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(WEB_KEY);
    } catch {
      // Preserve logout when browser storage is unavailable or blocked.
    }
    return;
  }

  await SecureStore.deleteItemAsync(NATIVE_KEY).catch(() => undefined);
}

async function readSerialized(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(WEB_KEY) ?? null;
    } catch {
      return null;
    }
  }

  return SecureStore.getItemAsync(NATIVE_KEY).catch(() => null);
}
