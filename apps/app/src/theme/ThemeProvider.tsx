import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { colors } from './tokens';
import type { PropsWithChildren } from 'react';
import type { ThemeColors } from './tokens';

const ThemeContext = createContext<ThemeColors>(colors.light);

export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const value = useMemo(() => (scheme === 'dark' ? colors.dark : colors.light), [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
