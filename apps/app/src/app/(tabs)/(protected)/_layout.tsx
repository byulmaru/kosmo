import { Slot, Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Splash } from '@/components/Splash';
import { useSession } from '@/session/SessionProvider';

export default function ProtectedLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const operationalRouteAllowed = pathname === '/notifications';

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/');
    } else if (status === 'operational' && !operationalRouteAllowed) {
      router.replace('/notifications');
    }
  }, [operationalRouteAllowed, router, status]);

  if (status === 'guest') {
    return <Splash label="로그인 상태를 확인하는 중입니다." />;
  }

  if (status === 'operational' && !operationalRouteAllowed) {
    return <Splash label="알림 화면으로 이동하는 중입니다." />;
  }

  return Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />;
}
