import { createContext, useContext } from 'react';
import { colors } from './tokens';
import type { PropsWithChildren } from 'react';
import type { ThemeColors } from './tokens';

const ThemeContext = createContext<ThemeColors>(colors.light);

export function ThemeProvider({ children }: PropsWithChildren) {
  return <ThemeContext.Provider value={colors.light}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
