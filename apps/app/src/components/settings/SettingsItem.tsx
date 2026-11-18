import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, fontFamilies, layoutRecipes, space, typography } from '@/theme/tokens';
import type { ReactNode } from 'react';

export type SettingsItemProps = {
  density?: 'default' | 'compact';
  description?: string;
  label: string;
  leading?: ReactNode;
  selected?: boolean;
  testID?: string;
  trailing?: ReactNode;
};

export function SettingsItem({
  density = 'default',
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
        density === 'compact' ? styles.compact : undefined,
        {
          backgroundColor: selected ? theme.stateSelectedSurface : 'transparent',
          borderColor: 'transparent',
        },
      ])}
      testID={testID}
    >
      <SettingsItemContent
        description={description}
        label={label}
        leading={leading}
        trailing={trailing}
      />
      <View
        pointerEvents="none"
        style={[styles.divider, { backgroundColor: theme.borderSubtle }]}
      />
    </View>
  );
}

export function SettingsItemContent({
  description,
  label,
  leading,
  trailing,
}: Pick<SettingsItemProps, 'description' | 'label' | 'leading' | 'trailing'>) {
  const theme = useTheme();

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    ...layoutRecipes.listRow,
    borderBottomWidth: 1,
    minWidth: 0,
    position: 'relative',
    width: '100%',
  },
  compact: { minHeight: 40, paddingVertical: space[4] },
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
  divider: { bottom: -1.5, height: borderWidths[1], left: 0, position: 'absolute', right: 0 },
});
