import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';

export const PROFILE_TAG_CHIP_VISUAL_SIZE = 32;

export type ProfileTagChipProps =
  | {
      disabled?: never;
      name: string;
      onRemove?: never;
      removable: false;
    }
  | {
      disabled?: boolean;
      name: string;
      onRemove: () => void;
      removable: true;
    };

export function ProfileTagChip(props: ProfileTagChipProps) {
  const { name, removable } = props;
  const theme = useTheme();
  const chip = (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.surface, borderColor: theme.border },
        removable && styles.removableChip,
      ]}
      testID="profile-tag-chip"
    >
      <Text
        accessibilityLabel={`#${name}`}
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[styles.text, { color: theme.text }]}
      >
        #{name}
      </Text>
    </View>
  );

  if (!removable) {
    return chip;
  }

  const { disabled = false, onRemove } = props;
  const removeActionTargetSize = Platform.select({ android: 48, ios: 44, web: 32, default: 48 });
  const removeActionTargetInset = (removeActionTargetSize - PROFILE_TAG_CHIP_VISUAL_SIZE) / 2;

  return (
    <View
      style={[
        styles.removableRoot,
        { minHeight: removeActionTargetSize, paddingRight: removeActionTargetInset },
      ]}
    >
      {chip}
      <Pressable
        accessibilityLabel={`#${name} 제거`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onRemove}
        style={({ pressed }) => [
          styles.removeTarget,
          { height: removeActionTargetSize, width: removeActionTargetSize },
          { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
        ]}
        testID="profile-tag-remove-button"
      >
        <View style={styles.removeVisual}>
          <Text style={[styles.removeLabel, { color: theme.textSecondary }]}>×</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    height: PROFILE_TAG_CHIP_VISUAL_SIZE,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
  },
  removableChip: {
    paddingRight: PROFILE_TAG_CHIP_VISUAL_SIZE,
    pointerEvents: 'none',
  },
  removableRoot: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 0,
    position: 'relative',
  },
  removeTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
  },
  removeVisual: {
    alignItems: 'center',
    height: PROFILE_TAG_CHIP_VISUAL_SIZE,
    justifyContent: 'center',
    pointerEvents: 'none',
    width: PROFILE_TAG_CHIP_VISUAL_SIZE,
  },
  removeLabel: {
    fontFamily: 'SUIT',
    ...typography.lg,
  },
  text: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    ...typography.sm,
  },
});
