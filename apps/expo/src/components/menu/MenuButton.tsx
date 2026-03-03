import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IoniconsName;
  children: string;
  style?: ViewStyle;
} & ({ href: string; onPress?: never } | { href?: never; onPress: () => void });

export default function MenuButton({ icon, children, style, ...props }: Props) {
  const handlePress = () => {
    if ('href' in props && props.href) {
      router.push(props.href as never);
    } else if (props.onPress) {
      props.onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={24} color="#374151" />
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  pressed: {
    backgroundColor: '#f3f4f6',
  },
  label: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
  },
});
