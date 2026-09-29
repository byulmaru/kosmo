import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeColorSync } from './ThemeColorSync';
import { normalizeThemePreference, THEME_PREFERENCE_STORAGE_KEY } from './themePreference';
import { ThemeProvider } from './ThemeProvider';
import { useSystemColorScheme } from './useSystemColorScheme';
import type { PropsWithChildren } from 'react';
import type { ThemePreference } from './themePreference';

type ThemePreferenceContextValue = Readonly<{
  clearStorageError: () => void;
  hydrated: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  storageError: 'read' | 'write' | null;
}>;

const ThemePreferenceContext = createContext<ThemePreferenceContextValue>({
  clearStorageError: () => undefined,
  hydrated: false,
  preference: 'system',
  setPreference: () => undefined,
  storageError: null,
});

export function ThemePreferenceProvider({
  children,
  onHydrated,
}: PropsWithChildren<{ onHydrated?: () => void }>) {
  const systemMode = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<'read' | 'write' | null>(null);
  const resolvedMode = preference === 'system' ? systemMode : preference;

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
      .then((value) => {
        if (!active) {
          return;
        }
        setPreferenceState(normalizeThemePreference(value));
        setHydrated(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setPreferenceState('system');
        setStorageError('read');
        setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    const normalized = normalizeThemePreference(next);
    setPreferenceState(normalized);
    void AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, normalized).catch(() => {
      setStorageError('write');
    });
  }, []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  if (!hydrated) {
    return null;
  }

  return (
    <ThemeProvider mode={resolvedMode}>
      <ThemePreferenceContext.Provider
        value={{ clearStorageError, hydrated, preference, setPreference, storageError }}
      >
        <ThemeColorSync />
        <ThemeHydrationNotifier onHydrated={onHydrated} />
        {children}
      </ThemePreferenceContext.Provider>
    </ThemeProvider>
  );
}

function ThemeHydrationNotifier({ onHydrated }: { onHydrated?: () => void }) {
  useEffect(() => {
    onHydrated?.();
  }, [onHydrated]);

  return null;
}

export function useThemePreference(): ThemePreference {
  return useContext(ThemePreferenceContext).preference;
}

export function useSetThemePreference(): (preference: ThemePreference) => void {
  return useContext(ThemePreferenceContext).setPreference;
}

export function useThemeStorageError() {
  return useContext(ThemePreferenceContext).storageError;
}

export function useClearThemeStorageError() {
  return useContext(ThemePreferenceContext).clearStorageError;
}
