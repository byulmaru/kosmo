import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';

type AvatarProps = {
  label: string;
  size?: number;
};

export function Avatar({ label, size = 48 }: AvatarProps) {
  const theme = useTheme();
  const initial = label.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <View
      accessibilityLabel={`${label} 프로필 이미지`}
      style={[
        styles.root,
        { backgroundColor: theme.surface, borderColor: theme.border, height: size, width: size },
      ]}
    >
      <Text
        style={{ color: theme.text, fontFamily: 'SUIT', fontSize: size * 0.36, fontWeight: '700' }}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
