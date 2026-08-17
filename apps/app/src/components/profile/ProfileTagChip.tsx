import { XIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { ICON_BUTTON_TARGET_SIZE, IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radii, spacing, typography } from '@/theme/tokens';

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
  const removeActionTargetInset = (ICON_BUTTON_TARGET_SIZE - PROFILE_TAG_CHIP_VISUAL_SIZE) / 2;

  return (
    <View
      style={[
        styles.removableRoot,
        { minHeight: ICON_BUTTON_TARGET_SIZE, paddingRight: removeActionTargetInset },
      ]}
    >
      {chip}
      <IconButton
        accessibilityLabel={`#${name} 제거`}
        disabled={disabled}
        feedback="opacity"
        onPress={onRemove}
        style={styles.removeTarget}
        targetSize={ICON_BUTTON_TARGET_SIZE}
        testID="profile-tag-remove-button"
        visualSize={PROFILE_TAG_CHIP_VISUAL_SIZE}
      >
        <XIcon color={theme.textSecondary} size={iconSizes[18]} strokeWidth={2} />
      </IconButton>
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
    position: 'absolute',
    right: 0,
  },
  text: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    ...typography.sm,
  },
});
