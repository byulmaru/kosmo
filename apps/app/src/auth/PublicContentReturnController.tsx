import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useSession } from '@/session/SessionProvider';
import { clearCallbackReturnTarget, consumeCallbackReturnTarget } from './publicContentReturn';
import type { Href } from 'expo-router';

export function PublicContentReturnController() {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedProfileId, status } = useSession();

  useEffect(() => {
    if (Platform.OS !== 'web' || status === 'error') {
      return;
    }

    if (status === 'guest' || pathname !== '/home') {
      clearCallbackReturnTarget();
      return;
    }

    if (status !== 'valid' || !selectedProfileId) {
      return;
    }

    const returnTarget = consumeCallbackReturnTarget();
    if (returnTarget) {
      router.replace(returnTarget as Href);
    }
  }, [pathname, router, selectedProfileId, status]);

  return null;
}
