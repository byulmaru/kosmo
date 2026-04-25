import { Tabs } from 'expo-router';
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="search" options={{ title: '검색' }} />
      <Tabs.Screen name="compose" options={{ title: '글쓰기' }} />
      <Tabs.Screen name="notifications" options={{ title: '알림' }} />
      <Tabs.Screen name="menu" options={{ title: '메뉴' }} />
    </Tabs>
  );
}
