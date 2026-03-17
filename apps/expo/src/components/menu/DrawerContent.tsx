import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationItems } from '@/components/navigation/navigationItems';
import MenuButton from './MenuButton';

export default function DrawerContent() {
  const { t } = useTranslation('expo');
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
      {navigationItems.map((item) => (
        <MenuButton key={item.href} href={item.href} icon={item.icon}>
          {t(`navigation.${item.translationKey}.label`)}
        </MenuButton>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
