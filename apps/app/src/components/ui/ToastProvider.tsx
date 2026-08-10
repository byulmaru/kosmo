import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, shadow, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

const toastDurationMs = 3000;

type ToastContextValue = Readonly<{
  showToast: (message: string, options?: ToastOptions) => () => void;
}>;

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastOptions = Readonly<{
  action?: Readonly<{
    label: string;
    onPress: () => void;
  }>;
}>;

type Toast = Readonly<{
  action?: ToastOptions['action'];
  id: number;
  message: string;
}>;

export function ToastProvider({ children }: PropsWithChildren): ReactNode {
  const [toast, setToast] = useState<Toast | null>(null);
  const activeToastId = useRef<number | null>(null);
  const nextToastId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hasBottomTabBar = Platform.OS !== 'web' || width < breakpoints.compact;
  const bottom = insets.bottom + (hasBottomTabBar ? 56 : 0) + spacing.sm;

  const dismissToast = useCallback((id?: number) => {
    if (id !== undefined && activeToastId.current !== id) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    activeToastId.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    (nextMessage: string, options?: ToastOptions) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      const id = nextToastId.current++;
      activeToastId.current = id;
      setToast({ action: options?.action, id, message: nextMessage });
      timer.current = setTimeout(() => {
        if (activeToastId.current !== id) {
          return;
        }
        activeToastId.current = null;
        setToast(null);
        timer.current = null;
      }, toastDurationMs);
      return () => dismissToast(id);
    },
    [dismissToast],
  );

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
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
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={spacing.sm}
                onPress={() => {
                  const action = toast.action;
                  dismissToast(toast.id);
                  action?.onPress();
                }}
                style={styles.action}
              >
                <Text style={[styles.actionLabel, { color: theme.background }]}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : null}
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
  pointerEvents: 'box-none',
  position: 'fixed',
  right: 0,
  zIndex: 30,
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  actionLabel: {
    fontFamily: 'SUIT',
    fontWeight: '800',
    textDecorationLine: 'underline',
    ...typography.sm,
  },
  message: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    transform: [{ translateY: 2 }],
    ...typography.sm,
  },
  nativeHost: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
    zIndex: 30,
  },
  toast: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    pointerEvents: 'auto',
    ...shadow,
  },
});
