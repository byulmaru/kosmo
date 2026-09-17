import { Slot, Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Splash } from '@/components/Splash';
import { useSession } from '@/session/SessionProvider';

export default function ProtectedLayout() {
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

  return Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />;
}
