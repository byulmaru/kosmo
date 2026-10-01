import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, layoutRecipes, typography } from '@/theme/tokens';
import type { ReactNode } from 'react';

export type SettingsItemProps = {
  description?: string;
  label: string;
  leading?: ReactNode;
  selected?: boolean;
  testID?: string;
  trailing?: ReactNode;
};

export function SettingsItem({
  description,
  label,
  leading,
  selected = false,
  testID,
  trailing,
}: SettingsItemProps) {
  const theme = useTheme();

  return (
    <View
      style={StyleSheet.flatten([
        styles.root,
        {
          backgroundColor: selected ? theme.stateSelectedSurface : 'transparent',
          borderColor: theme.borderSubtle,
        },
      ])}
      testID={testID}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.copy}>
        <Text style={[styles.label, { color: theme.foregroundPrimary }]}>{label}</Text>
        {description ? (
          <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...layoutRecipes.listRow,
    borderBottomWidth: 1,
    minWidth: 0,
    width: '100%',
  },
  leading: { flexShrink: 0 },
  copy: { ...layoutRecipes.labelSupportStack, flex: 1, minWidth: 0 },
  label: {
    flexShrink: 1,
    fontFamily: fontFamilies.ui,
    fontWeight: '700',
    ...typography.md,
  },
  description: { flexShrink: 1, fontFamily: fontFamilies.ui, ...typography.sm },
  trailing: { flexShrink: 0 },
});
