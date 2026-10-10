import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { NativeBottomTabBar } from '@/components/shell/BottomTabBar';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { Splash } from '@/components/Splash';
import { useSession } from '@/session/SessionProvider';

export const unstable_settings = {
  initialRouteName: '(home)',
};

export default function TabsLayout() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/');
    }
  }, [router, status]);

  if (status === 'guest') {
    return <Splash label="로그인 상태를 확인하는 중입니다." />;
  }

  return (
    <UniversalShell showBottomTabBar={false}>
      <Tabs
        screenOptions={{ headerShown: false, lazy: true }}
        tabBar={(props) => <NativeBottomTabBar {...props} />}
      >
        <Tabs.Screen name="(account)" options={{ title: '프로필' }} />
        <Tabs.Screen name="(home)" options={{ title: '홈' }} />
        <Tabs.Screen name="(notifications)" options={{ title: '알림' }} />
        <Tabs.Screen name="(primary-search)" options={{ title: '검색' }} />
        <Tabs.Screen name="(post)" options={{ href: null }} />
        <Tabs.Screen name="(profile)" options={{ href: null }} />
        <Tabs.Screen name="(protected)" options={{ href: null }} />
      </Tabs>
    </UniversalShell>
  );
}
