import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { breakpoints, space } from '@/theme/tokens';
import { useToastMotion } from '@/theme/useOverlayMotion';
import { Toast } from './Toast';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import type { ToastProps } from './Toast';

const toastDurationMs = 3000;

type ToastContextValue = Readonly<{
  showToast: (message: string, options: ToastOptions) => () => void;
}>;

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastOptions = Omit<ToastProps, 'message'> & Readonly<{ persistent?: boolean }>;

type ToastState = Readonly<{
  persistent?: boolean;
  action?: ToastOptions['action'];
  id: number;
  message: string;
  tone: ToastOptions['tone'];
}>;

export function ToastProvider({ children }: PropsWithChildren): ReactNode {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const activeToastId = useRef<number | null>(null);
  const nextToastId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hasBottomTabBar = Platform.OS !== 'web' || width < breakpoints.compact;
  const bottom = insets.bottom + (hasBottomTabBar ? 56 : 0) + space[8];
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
    (nextMessage: string, options: ToastOptions) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      const id = nextToastId.current++;
      activeToastId.current = id;
      setToast({
        action: options.action,
        id,
        message: nextMessage,
        persistent: options.persistent,
        tone: options.tone,
      });
      setToastVisible(true);
      return () => dismissToast(id);
    },
    [dismissToast],
  );

  useEffect(() => {
    if (!toast || toast.persistent || !toastVisible || !toastMotion.entered) {
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
    if (!toastVisible && !toastMotion.mounted && activeToastId.current === null) {
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
          <Toast
            message={toast.message}
            tone={toast.tone}
            action={
              toast.action
                ? {
                    label: toast.action.label,
                    onPress: () => {
                      dismissToast(toast.id);
                      toast.action?.onPress();
                    },
                  }
                : undefined
            }
          />
        </Animated.View>
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
  nativeHost: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
    zIndex: 30,
  },
});
