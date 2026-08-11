import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { SettingsItem } from './SettingsItem';

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
      <NavigationLink href={BYULMARU_ID_ACCOUNT_SETTINGS_URL}>
        <Pressable
          accessibilityLabel={ENTRY_ACCESSIBILITY_LABEL}
          accessibilityRole="link"
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          style={entryStyle}
          testID="byulmaru-id-account-settings-entry"
        >
          <SettingsItem
            label={ENTRY_LABEL}
            testID="byulmaru-id-account-settings-item"
            trailing={
              <ChevronRightIcon
                accessibilityElementsHidden
                color={theme.textSecondary}
                pointerEvents="none"
                size={20}
                strokeWidth={2}
              />
            }
          />
        </Pressable>
      </NavigationLink>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  entry: {
    minHeight: 64,
    width: '100%',
  },
  entryFocused: {
    outlineStyle: 'solid' as never,
    outlineWidth: 2,
  },
});
