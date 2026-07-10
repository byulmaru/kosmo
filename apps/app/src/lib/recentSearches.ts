import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'kosmo.recent-searches';
const LIMIT = 8;

export async function readRecentSearches(): Promise<string[]> {
  const serialized =
    Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(KEY)
      : await SecureStore.getItemAsync(KEY).catch(() => null);

  if (!serialized) {
    return [];
  }

  try {
    const value = JSON.parse(serialized) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, LIMIT)
      : [];
  }
  catch {
    return [];
  }
}

export async function writeRecentSearches(searches: string[]): Promise<void> {
  const serialized = JSON.stringify(searches.slice(0, LIMIT));

  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(KEY, serialized);
    return;
  }

  await SecureStore.setItemAsync(KEY, serialized);
}

export function addRecentSearch(searches: string[], term: string): string[] {
  const normalized = term.trim();
  return normalized
    ? [normalized, ...searches.filter((item) => item !== normalized)].slice(0, LIMIT)
    : searches;
}
