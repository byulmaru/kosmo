import { useLayoutEffect } from 'react';
import { useTheme, useThemeMode } from './ThemeProvider';

export function ThemeColorSync() {
  const mode = useThemeMode();
  const theme = useTheme();

  useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.append(meta);
    }
    meta.content = theme.backgroundCanvas;
    document.documentElement.style.backgroundColor = theme.backgroundCanvas;
    document.documentElement.style.colorScheme = mode;
    document.body.style.backgroundColor = theme.backgroundCanvas;
  }, [mode, theme.backgroundCanvas]);

  return null;
}
