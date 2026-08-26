import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radius, space, textStyles } from '@/theme/tokens';
import { useToastMotion } from '@/theme/useOverlayMotion';
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
  tone?: 'danger' | 'info' | 'success' | 'warning';
}>;

type Toast = Readonly<{
  action?: ToastOptions['action'];
  id: number;
  message: string;
  tone?: ToastOptions['tone'];
}>;

export function ToastProvider({ children }: PropsWithChildren): ReactNode {
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const activeToastId = useRef<number | null>(null);
  const nextToastId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hasBottomTabBar = Platform.OS !== 'web' || width < breakpoints.compact;
  const bottom = insets.bottom + (hasBottomTabBar ? 56 : 0) + space[8];
  const toastColors = toast ? getToastColors(theme, toast.tone) : undefined;
  const toastMotion = useToastMotion(toastVisible);

  const dismissToast = useCallback((id?: number) => {
    if (id !== undefined && activeToastId.current !== id) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    activeToastId.current = null;
    setToastVisible(false);
  }, []);

  const showToast = useCallback(
    (nextMessage: string, options?: ToastOptions) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      const id = nextToastId.current++;
      activeToastId.current = id;
      setToast({ action: options?.action, id, message: nextMessage, tone: options?.tone });
      setToastVisible(true);
      return () => dismissToast(id);
    },
    [dismissToast],
  );

  useEffect(() => {
    if (!toast || !toastVisible || !toastMotion.entered) {
      return;
    }

    const id = toast.id;
    timer.current = setTimeout(() => dismissToast(id), toastDurationMs);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [dismissToast, toast, toastMotion.entered, toastVisible]);

  useEffect(() => {
    if (!toastVisible && !toastMotion.mounted) {
      setToast(null);
    }
  }, [toastMotion.mounted, toastVisible]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && toastMotion.mounted ? (
        <Animated.View
          key={toast.id}
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[
            Platform.OS === 'web' ? webHost : styles.nativeHost,
            {
              opacity: toastMotion.progress,
              paddingBottom: bottom,
              transform: [
                {
                  translateY: toastMotion.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [space[8], 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.toast,
              toast.action ? styles.actionToast : undefined,
              elevation.floating,
              {
                backgroundColor: toastColors?.background,
                borderLeftColor: toastColors?.border,
                borderLeftWidth: toastColors?.border ? 4 : undefined,
              },
            ]}
          >
            <Text style={[styles.message, { color: toastColors?.foreground }]}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={Platform.OS === 'android' ? 2 : undefined}
                onPress={() => {
                  const action = toast.action;
                  dismissToast(toast.id);
                  action?.onPress();
                }}
                style={styles.action}
              >
                <Text style={[styles.actionLabel, { color: toastColors?.foreground }]}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

function getToastColors(theme: ReturnType<typeof useTheme>, tone: ToastOptions['tone']) {
  if (tone === 'danger') {
    return {
      background: theme.feedbackDangerSubtle,
      border: theme.feedbackDangerBorder,
      foreground: theme.feedbackDangerOnSubtle,
    };
  }
  if (tone === 'success') {
    return {
      background: theme.feedbackSuccessSubtle,
      border: theme.feedbackSuccessBorder,
      foreground: theme.feedbackSuccessOnSubtle,
    };
  }
  if (tone === 'warning') {
    return {
      background: theme.feedbackWarningSubtle,
      border: theme.feedbackWarningBorder,
      foreground: theme.feedbackWarningOnSubtle,
    };
  }
  if (tone === 'info') {
    return {
      background: theme.feedbackInfoSubtle,
      border: theme.feedbackInfoBorder,
      foreground: theme.feedbackInfoOnSubtle,
    };
  }

  return { background: theme.backgroundInverse, foreground: theme.foregroundInverse };
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
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
  },
  actionLabel: {
    textDecorationLine: 'underline',
    ...textStyles.uiLabelM,
  },
  message: {
    flexShrink: 1,
    transform: [{ translateY: 2 }],
    ...textStyles.uiCopyM,
  },
  nativeHost: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
    zIndex: 30,
  },
  actionToast: { paddingVertical: space[4] },
  toast: {
    alignItems: 'center',
    borderRadius: radius[12],
    flexDirection: 'row',
    gap: space[12],
    maxWidth: 480,
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    pointerEvents: 'auto',
  },
});
