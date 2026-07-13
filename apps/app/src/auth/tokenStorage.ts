import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getNativeSessionConfiguration } from './nativeConfig';
import { parseStoredSessionToken, serializeStoredSessionToken } from './sessionToken';

const SESSION_TOKEN_KEY = 'kosmo.session-token';

export async function readSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !(await SecureStore.isAvailableAsync())) {
    return null;
  }

  const stored = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);

  if (stored === null) {
    return null;
  }

  const token = parseStoredSessionToken(stored, getNativeSessionConfiguration());

  if (!token) {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  }

  return token;
}

export async function writeSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web' || !(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.setItemAsync(
    SESSION_TOKEN_KEY,
    serializeStoredSessionToken(getNativeSessionConfiguration(), token),
    {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    },
  );
}

export async function deleteSessionToken(): Promise<void> {
  if (Platform.OS === 'web' || !(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
