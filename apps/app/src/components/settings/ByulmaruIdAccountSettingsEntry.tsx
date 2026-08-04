import { Link } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { LinkProps } from 'expo-router';

export const BYULMARU_ID_ACCOUNT_SETTINGS_URL = 'https://id.byulmaru.co';

const ENTRY_LABEL = 'Byulmaru ID 계정 설정';
const ENTRY_ACCESSIBILITY_LABEL = `${ENTRY_LABEL}, 외부 서비스로 이동`;
const FAILURE_MESSAGE = 'Byulmaru ID 계정 설정을 열지 못했어요.';

export function ByulmaruIdAccountSettingsEntry() {
  const theme = useTheme();
  const [status, setStatus] = useState<'idle' | 'opening' | 'error' | 'retrying'>('idle');
  const [focused, setFocused] = useState(false);
  const isOpeningRef = useRef(false);
  const web = Platform.OS === 'web';
  const isOpening = status === 'opening' || status === 'retrying';
  const hasError = status === 'error' || status === 'retrying';

  const openAccountSettings = useCallback(async (retrying = false) => {
    if (isOpeningRef.current) {
      return;
    }

    isOpeningRef.current = true;
    setStatus(retrying ? 'retrying' : 'opening');
    try {
      if (!(await Linking.canOpenURL(BYULMARU_ID_ACCOUNT_SETTINGS_URL))) {
        throw new Error('unsupported external URL');
      }

      await Linking.openURL(BYULMARU_ID_ACCOUNT_SETTINGS_URL);
      setStatus('idle');
    } catch {
      setStatus('error');
    } finally {
      isOpeningRef.current = false;
    }
  }, []);

  const handleWebPress: NonNullable<LinkProps['onPress']> = (event) => {
    if (!shouldHandleWebNavigation(event)) {
      return;
    }

    event.preventDefault();
    void openAccountSettings();
  };

  const entry = (
    <Pressable
      accessibilityLabel={ENTRY_ACCESSIBILITY_LABEL}
      accessibilityRole="link"
      accessibilityState={{ busy: isOpening, disabled: isOpening || hasError }}
      aria-busy={web && isOpening ? true : undefined}
      disabled={isOpening || hasError}
      onPress={web ? handleWebPress : () => openAccountSettings()}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      style={({ pressed }) => [
        styles.entry,
        web && focused ? styles.entryFocused : null,
        {
          borderColor: theme.divider,
          outlineColor: web && focused ? theme.focus : undefined,
          opacity: pressed || isOpening || hasError ? 0.6 : 1,
        },
      ]}
      testID="byulmaru-id-account-settings-entry"
    >
      <Text style={[styles.label, { color: theme.text }]}>{ENTRY_LABEL}</Text>
      <ChevronRightIcon
        accessibilityElementsHidden
        color={theme.textSecondary}
        pointerEvents="none"
        size={20}
        strokeWidth={2}
      />
    </Pressable>
  );

  return (
    <View style={styles.root} testID="byulmaru-id-account-settings-entry-container">
      {web ? (
        <Link asChild href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}>
          {entry}
        </Link>
      ) : (
        entry
      )}

      {hasError ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { borderColor: theme.divider }]}
          testID="byulmaru-id-account-settings-navigation-error"
        >
          <Text style={[styles.errorMessage, { color: theme.danger }]}>{FAILURE_MESSAGE}</Text>
          <Pressable
            accessibilityLabel="Byulmaru ID 계정 설정 다시 시도"
            accessibilityRole="button"
            accessibilityState={{
              busy: status === 'retrying',
              disabled: !web && status === 'retrying',
            }}
            aria-busy={web && status === 'retrying' ? true : undefined}
            disabled={!web && status === 'retrying'}
            onPress={() => openAccountSettings(true)}
            style={({ pressed }) => [
              styles.retry,
              {
                borderColor: theme.border,
                opacity: pressed || status === 'retrying' ? 0.7 : 1,
              },
            ]}
            testID="byulmaru-id-account-settings-retry"
          >
            <Text style={[styles.retryLabel, { color: theme.text }]}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function shouldHandleWebNavigation(event: Parameters<NonNullable<LinkProps['onPress']>>[0]) {
  const webEvent = event as typeof event & {
    altKey?: boolean;
    button?: number;
    ctrlKey?: boolean;
    currentTarget?: { target?: string | null };
    metaKey?: boolean;
    shiftKey?: boolean;
  };
  return (
    !webEvent.defaultPrevented &&
    !webEvent.metaKey &&
    !webEvent.altKey &&
    !webEvent.ctrlKey &&
    !webEvent.shiftKey &&
    (webEvent.button == null || webEvent.button === 0) &&
    [undefined, null, '', 'self'].includes(webEvent.currentTarget?.target)
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  entry: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  entryFocused: {
    outlineStyle: 'solid' as never,
    outlineWidth: 2,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.md,
  },
  error: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorMessage: { fontFamily: 'SUIT', ...typography.sm },
  retry: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 112,
    paddingHorizontal: spacing.lg,
  },
  retryLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
});
