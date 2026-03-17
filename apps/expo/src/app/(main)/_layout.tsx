import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DrawerContent from '@/components/menu/DrawerContent';
import { navigationItems } from '@/components/navigation/navigationItems';

const SM_BREAKPOINT = 640;

export default function MainLayout() {
  const { t } = useTranslation('expo');
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLargeScreen = width >= SM_BREAKPOINT;
  const tabBarBottomPadding = Math.max(insets.bottom, 12);
  const tabBarHeight = 52 + 8 + tabBarBottomPadding;

  if (!isLargeScreen) {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#111827',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarShowLabel: false,
          tabBarStyle: {
            height: tabBarHeight,
            borderTopWidth: 1,
            borderTopColor: '#e2e8f0',
            backgroundColor: '#ffffff',
          },
        }}
      >
        {navigationItems.map((item) => {
          const routeName = item.href === '/' ? 'index' : item.href.slice(1);

          return (
            <Tabs.Screen
              key={item.href}
              name={routeName}
              options={{
                title: t(`navigation.${item.translationKey}.title`),
                tabBarAccessibilityLabel: t(`navigation.${item.translationKey}.label`),
                tabBarButton: (props) => {
                  const { style, ...pressableProps } = props;

                  return (
                    <Pressable
                      {...(pressableProps as object)}
                      style={({ pressed }) => [
                        style,
                        styles.tabButton,
                        {
                          paddingTop: 8,
                          paddingBottom: tabBarBottomPadding,
                        },
                        pressed && styles.tabButtonPressed,
                      ]}
                    />
                  );
                },
                tabBarIcon: ({ color, focused, size }) => (
                  <View style={styles.tabIconSlot}>
                    <Ionicons
                      name={focused ? item.activeIcon : item.icon}
                      color={color}
                      size={size}
                    />
                  </View>
                ),
              }}
            />
          );
        })}
      </Tabs>
    );
  }

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: isLargeScreen ? 'permanent' : 'front',
        drawerStyle: {
          width: isLargeScreen ? 240 : 280,
          borderRightWidth: 1,
          borderRightColor: '#e5e7eb',
        },
      }}
    />
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconSlot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonPressed: {
    opacity: 0.72,
  },
});
