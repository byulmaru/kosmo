import { useColorScheme } from 'react-native';
import type { ThemeMode } from './tokens';

export function useSystemColorScheme(): ThemeMode {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}
