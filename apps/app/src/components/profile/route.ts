import { useGlobalSearchParams, useLocalSearchParams } from 'expo-router';

function normalizeProfileHandle(profileHandle?: string | string[]): string {
  const value = Array.isArray(profileHandle) ? profileHandle[0] : profileHandle;

  return (value ?? '').replace(/^@/, '');
}

export function useProfileHandle(): string {
  const { profileHandle } = useLocalSearchParams<{ profileHandle?: string | string[] }>();

  return normalizeProfileHandle(profileHandle);
}

export function useProfileLayoutHandle(): string {
  const { profileHandle } = useGlobalSearchParams<{ profileHandle?: string | string[] }>();

  return normalizeProfileHandle(profileHandle);
}
