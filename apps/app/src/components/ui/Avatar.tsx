import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius } from '@/theme/tokens';
import defaultAvatar from '../../../assets/avatar/default-avatar.png';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

type AvatarProps = {
  imageUri?: string | null;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ imageUri = null, label, size = 40, style }: AvatarProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityLabel={`${label} 프로필 이미지`}
      accessibilityRole="image"
      style={[
        styles.root,
        {
          backgroundColor: theme.backgroundSurface,
          borderColor: theme.borderDefault,
          height: size,
          width: size,
        },
        style,
      ]}
    >
      <Image
        accessible={false}
        resizeMode="cover"
        source={resolveAvatarSource(imageUri)}
        style={styles.image}
      />
    </View>
  );
}

function resolveAvatarSource(imageUri: string | null): ImageSourcePropType {
  if (imageUri) {
    return { uri: imageUri };
  }
  return typeof defaultAvatar === 'string' ? { uri: defaultAvatar } : defaultAvatar;
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: borderWidths[1],
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { height: '100%', width: '100%' },
});
