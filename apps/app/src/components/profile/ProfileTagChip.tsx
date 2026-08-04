import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { StyleProp, ViewStyle } from 'react-native';

export const PROFILE_TAG_CHIP_VISUAL_SIZE = 32;

export type ProfileTagChipProps = {
  name: string;
  style?: StyleProp<ViewStyle>;
};

export function ProfileTagChip({ name, style }: ProfileTagChipProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.root, { backgroundColor: theme.surface, borderColor: theme.border }, style]}
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
  text: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    ...typography.sm,
  },
});
