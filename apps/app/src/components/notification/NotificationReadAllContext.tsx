import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren, ReactNode } from 'react';

export type NotificationReadAllAction = Readonly<{
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}>;

type Registration = Readonly<{
  action: NotificationReadAllAction;
  token: object;
}>;

type NotificationReadAllContextValue = Readonly<{
  action: NotificationReadAllAction;
  invoke: () => void;
  register: (action: NotificationReadAllAction) => () => void;
}>;

const disabledAction: NotificationReadAllAction = {
  busy: false,
  disabled: true,
  onPress: () => undefined,
};

const NotificationReadAllContext = createContext<NotificationReadAllContextValue | null>(null);

export function NotificationReadAllProvider({ children }: PropsWithChildren): ReactNode {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const registrationRef = useRef<Registration | null>(null);
  const register = useCallback((action: NotificationReadAllAction) => {
    const token = {};
    const next = { action, token };
    registrationRef.current = next;
    setRegistration(next);
    return () => {
      if (registrationRef.current?.token !== token) {
        return;
      }
      registrationRef.current = null;
      setRegistration(null);
    };
  }, []);
  const invoke = useCallback(() => registrationRef.current?.action.onPress(), []);
  const value = useMemo(
    () => ({ action: registration?.action ?? disabledAction, invoke, register }),
    [invoke, register, registration?.action],
  );

  return (
    <NotificationReadAllContext.Provider value={value}>
      {children}
    </NotificationReadAllContext.Provider>
  );
}

export function useNotificationReadAll() {
  const context = useContext(NotificationReadAllContext);

  if (!context) {
    throw new Error('useNotificationReadAll must be used within NotificationReadAllProvider.');
  }

  return context;
}

export function NotificationReadAllAction() {
  const { action } = useNotificationReadAll();
  const theme = useTheme();

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="모두 읽음"
      accessibilityRole="button"
      accessibilityState={{ busy: action.busy, disabled: action.disabled }}
      aria-busy={action.busy || undefined}
      disabled={action.disabled}
      onPress={action.onPress}
      style={({ pressed }) => [
        styles.action,
        { opacity: action.disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: theme.text }]}>모두 읽음</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
});
