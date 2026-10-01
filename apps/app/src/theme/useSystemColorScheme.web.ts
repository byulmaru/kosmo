import { useEffect, useState } from 'react';
import type { ThemeMode } from './tokens';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

type MediaQueryListWithLegacyListeners = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

function getSystemColorScheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

export function useSystemColorScheme(): ThemeMode {
  const [scheme, setScheme] = useState<ThemeMode>(getSystemColorScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const query = window.matchMedia(DARK_SCHEME_QUERY) as MediaQueryListWithLegacyListeners;
    const onChange = (event: MediaQueryListEvent) => {
      setScheme(event.matches ? 'dark' : 'light');
    };

    setScheme(query.matches ? 'dark' : 'light');

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }

    query.addListener?.(onChange);
    return () => query.removeListener?.(onChange);
  }, []);

  return scheme;
}
