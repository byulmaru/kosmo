import { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { colors, elevations } from './tokens';
import type { PropsWithChildren } from 'react';
import type { ThemeColors, ThemeMode } from './tokens';

const ThemeContext = createContext<ThemeColors>(colors.light);
const ThemeModeContext = createContext<ThemeMode>('light');
const ReducedMotionContext = createContext(true);

type ThemeProviderProps = PropsWithChildren<{
  mode?: ThemeMode;
  reduceMotion?: boolean;
}>;

export function ThemeProvider({ children, mode = 'light', reduceMotion }: ThemeProviderProps) {
  const systemReducedMotion = useSystemReducedMotion(reduceMotion === undefined);

  return (
    <ThemeModeContext.Provider value={mode}>
      <ThemeContext.Provider value={colors[mode]}>
        <ReducedMotionContext.Provider value={reduceMotion ?? systemReducedMotion}>
          {children}
        </ReducedMotionContext.Provider>
      </ThemeContext.Provider>
    </ThemeModeContext.Provider>
  );
}

function useSystemReducedMotion(enabled: boolean): boolean {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        setReducedMotion(value);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [enabled]);

  return reducedMotion;
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeModeContext);
}

export function useElevation() {
  return elevations[useThemeMode()];
}

export function useReducedMotion(): boolean {
  return useContext(ReducedMotionContext);
}
