import { XIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { ICON_BUTTON_TARGET_SIZE, IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, iconSizes, radii, space, typography } from '@/theme/tokens';

export const PROFILE_TAG_CHIP_VISUAL_SIZE = 32;

export type ProfileTagChipProps =
  | {
      disabled?: never;
      label?: never;
      name: string;
      onRemove?: never;
      removable: false;
    }
  | {
      disabled?: boolean;
      label?: string;
      name: string;
      onRemove: () => void;
      removable: true;
    };

export function ProfileTagChip(props: ProfileTagChipProps) {
  const { label, name, removable } = props;
  const theme = useTheme();
  const displayLabel = label ?? `#${name}`;
  const chip = (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.backgroundSurface, borderColor: theme.borderDefault },
        removable && styles.removableChip,
      ]}
      testID="profile-tag-chip"
    >
      <Text
        accessibilityLabel={displayLabel}
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[styles.text, { color: theme.foregroundPrimary }]}
      >
        {displayLabel}
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
        accessibilityLabel={`${displayLabel} 제거`}
        disabled={disabled}
        feedback="opacity"
        onPress={onRemove}
        style={styles.removeTarget}
        targetSize={ICON_BUTTON_TARGET_SIZE}
        testID="profile-tag-remove-button"
        visualSize={PROFILE_TAG_CHIP_VISUAL_SIZE}
      >
        <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
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
    paddingHorizontal: space[8],
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
    fontFamily: fontFamilies.ui,
    ...typography.sm,
  },
});
