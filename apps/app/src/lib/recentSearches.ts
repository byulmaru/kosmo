import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Keep the existing web key so a framework migration does not discard browser history.
// SecureStore keys cannot contain `:`, so native uses a platform-safe equivalent.
const NATIVE_KEY = 'kosmo.recent-searches';
const WEB_KEY = 'kosmo:recent-searches';
const LIMIT = 8;

export async function readRecentSearches(): Promise<string[]> {
  let serialized: string | null | undefined;

  if (Platform.OS === 'web') {
    try {
      serialized = globalThis.localStorage?.getItem(WEB_KEY);
    } catch {
      return [];
    }
  } else {
    serialized = await SecureStore.getItemAsync(NATIVE_KEY).catch(() => null);
  }

  if (!serialized) {
    return [];
  }

  try {
    const value = JSON.parse(serialized) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

export async function writeRecentSearches(searches: string[]): Promise<void> {
  const serialized = JSON.stringify(searches.slice(0, LIMIT));

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(WEB_KEY, serialized);
    } catch {
      // Preserve the previous web behavior when storage is unavailable or blocked.
    }
    return;
  }

  await SecureStore.setItemAsync(NATIVE_KEY, serialized).catch(() => undefined);
}

export function addRecentSearch(searches: string[], term: string): string[] {
  const normalized = term.trim();
  return normalized
    ? [normalized, ...searches.filter((item) => item !== normalized)].slice(0, LIMIT)
    : searches;
}
