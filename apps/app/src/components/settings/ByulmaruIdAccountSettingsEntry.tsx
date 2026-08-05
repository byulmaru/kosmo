import { Link } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export const BYULMARU_ID_ACCOUNT_SETTINGS_URL = 'https://id.byulmaru.co';

const ENTRY_LABEL = '계정 설정';
const ENTRY_ACCESSIBILITY_LABEL = 'Byulmaru ID Account Settings 외부 서비스로 이동';

export function ByulmaruIdAccountSettingsEntry() {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const entryStyle = StyleSheet.flatten([
    styles.entry,
    focused ? styles.entryFocused : null,
    {
      borderColor: theme.divider,
      outlineColor: focused ? theme.focus : undefined,
    },
  ]);

  return (
    <View style={styles.root} testID="byulmaru-id-account-settings-entry-container">
      <Link asChild href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}>
        <Pressable
          accessibilityLabel={ENTRY_ACCESSIBILITY_LABEL}
          accessibilityRole="link"
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          style={entryStyle}
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
      </Link>
    </View>
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
});
