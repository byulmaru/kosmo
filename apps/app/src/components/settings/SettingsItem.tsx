import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, typography } from '@/theme/tokens';
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
          backgroundColor: selected ? theme.selectedSurface : 'transparent',
          borderColor: theme.divider,
        },
      ])}
      testID={testID}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.copy}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        {description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
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
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.md,
  },
  description: { flexShrink: 1, fontFamily: 'SUIT', ...typography.sm },
  trailing: { flexShrink: 0 },
});
