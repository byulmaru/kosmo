import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, shadow, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

const toastDurationMs = 3000;

type ToastContextValue = Readonly<{
  dismissToast: () => void;
  showToast: (message: string) => void;
}>;

const ToastContext = createContext<ToastContextValue | null>(null);

type Toast = Readonly<{
  id: number;
  message: string;
}>;

export function ToastProvider({ children }: PropsWithChildren): ReactNode {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextToastId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hasBottomTabBar = Platform.OS !== 'web' || width < breakpoints.compact;
  const bottom = insets.bottom + (hasBottomTabBar ? 56 : 0) + spacing.sm;

  const dismissToast = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((nextMessage: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    setToast({ id: nextToastId.current++, message: nextMessage });
    timer.current = setTimeout(() => {
      setToast(null);
      timer.current = null;
    }, toastDurationMs);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ dismissToast, showToast }}>
      {children}
      {toast ? (
        <View
          key={toast.id}
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[Platform.OS === 'web' ? webHost : styles.nativeHost, { paddingBottom: bottom }]}
        >
          <View style={[styles.toast, { backgroundColor: theme.accent }]}>
            <Text style={[styles.message, { color: theme.background }]}>{toast.message}</Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }
  return context;
}

const webHost = {
  alignItems: 'center',
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
  position: 'fixed',
  right: 0,
  zIndex: 30,
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  message: { fontFamily: 'SUIT', transform: [{ translateY: 2 }], ...typography.sm },
  nativeHost: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
    zIndex: 30,
  },
  toast: {
    borderRadius: radii.md,
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow,
  },
});
