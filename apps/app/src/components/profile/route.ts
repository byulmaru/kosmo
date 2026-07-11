import { useLocalSearchParams } from 'expo-router';

export function useProfileHandle(): string {
  const { profileHandle } = useLocalSearchParams<{ profileHandle?: string | string[] }>();
  const value = Array.isArray(profileHandle) ? profileHandle[0] : profileHandle;

  return (value ?? '').replace(/^@/, '');
}
