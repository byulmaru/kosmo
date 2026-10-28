import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { writeSelectedProfile } from '@/auth/selectedProfileStorage';
import { parseNativePushTapTarget } from '@/components/native-push/pushPayload';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';

export default function PushRoute() {
  const { href, notificationId, recipientAccountId, recipientProfileId } = useLocalSearchParams<{
    href?: string | string[];
    notificationId?: string | string[];
    recipientAccountId?: string | string[];
    recipientProfileId?: string | string[];
  }>();
  const { replace } = useRouter();
  const { resetActor } = useRelayActor();
  const { accountId, selectedProfileId, status } = useSession();

  // Browser notification clicks enter through an external URL; resolve them after SessionProvider is ready.
  useEffect(() => {
    if (status !== 'valid') {
      replace('/');
      return;
    }

    const target = parseNativePushTapTarget({
      href,
      notificationId,
      recipientAccountId,
      recipientProfileId,
    });
    if (!target) {
      replace('/notifications');
      return;
    }

    if (target.kind === 'operational') {
      if (accountId !== target.recipientAccountId) {
        replace('/notifications');
        return;
      }

      if (target.href.kind === 'internal') {
        replace(target.href.href);
      } else if (Platform.OS === 'web') {
        try {
          if (typeof window === 'undefined') {
            replace('/notifications');
            return;
          }

          // React Native Web Linking opens a new tab; replace this validated action URL in place.
          window.location.replace(target.href.href);
        } catch {
          replace('/notifications');
        }
      } else {
        void Linking.openURL(target.href.href).catch(() => replace('/notifications'));
      }
      return;
    }

    void (async () => {
      if (selectedProfileId !== target.recipientProfileId) {
        try {
          await writeSelectedProfile(target.recipientProfileId);
          resetActor(target.recipientProfileId);
        } catch {
          replace('/notifications');
          return;
        }
      }

      replace(target.href);
    })();
  }, [
    accountId,
    href,
    notificationId,
    recipientAccountId,
    recipientProfileId,
    replace,
    resetActor,
    selectedProfileId,
    status,
  ]);

  return null;
}
