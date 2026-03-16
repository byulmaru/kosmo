import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MenuButton from './MenuButton';

export default function DrawerContent(_props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
        },
      ]}
    >
      <MenuButton href="/" icon="home-outline">
        홈
      </MenuButton>
      <MenuButton href="/menu" icon="menu-outline">
        메뉴
      </MenuButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
