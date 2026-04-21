import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_TAB_ITEMS } from '@/features/navigation/bottom-tabs';

export function BottomTabBar({ state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {BOTTOM_TAB_ITEMS.map((item) => {
        const routeIndex = state.routes.findIndex((route) => route.name === item.routeName);
        const isFocused = routeIndex >= 0 && state.index === routeIndex;

        return (
          <Link key={item.key} href={item.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              style={[styles.tabButton, isFocused && styles.tabButtonActive]}
            >
              <Text style={[styles.icon, isFocused && styles.activeText]}>{item.icon}</Text>
              <Text style={[styles.label, isFocused && styles.activeText]}>{item.title}</Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    paddingVertical: 8,
  },
  tabButtonActive: {
    backgroundColor: '#eef2ff',
  },
  icon: {
    fontSize: 16,
    color: '#9ca3af',
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  activeText: {
    color: '#3730a3',
  },
});
