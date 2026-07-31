import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';
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
        { backgroundColor: theme.surface, borderColor: theme.border, height: size, width: size },
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
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { height: '100%', width: '100%' },
});
