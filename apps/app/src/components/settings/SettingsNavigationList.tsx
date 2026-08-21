import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes } from '@/theme/tokens';
import { ByulmaruIdAccountSettingsEntry } from './ByulmaruIdAccountSettingsEntry';
import { SettingsItem } from './SettingsItem';

type SettingsDestination = 'default-post-visibility';

export function SettingsNavigationList({ selected }: { selected?: SettingsDestination }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const current = selected === 'default-post-visibility';

  return (
    <View
      accessibilityLabel="설정 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <ByulmaruIdAccountSettingsEntry />
      <NavigationLink href="/settings/default-post-visibility" primary>
        <Pressable
          aria-current={current ? 'page' : undefined}
          accessibilityLabel="게시물 기본 공개 범위 설정 열기"
          accessibilityRole="link"
          accessibilityState={{ selected: current }}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          style={StyleSheet.flatten([
            styles.entry,
            focused ? styles.entryFocused : null,
            { outlineColor: focused ? theme.focus : undefined },
          ])}
        >
          <SettingsItem
            label="게시물 기본 공개 범위"
            selected={current}
            testID="settings-default-post-visibility-item"
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
  entry: { minHeight: 64, width: '100%' },
  entryFocused: {
    outlineStyle: 'solid' as never,
    outlineWidth: 2,
  },
});
