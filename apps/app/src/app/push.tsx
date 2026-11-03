import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { writeSelectedProfile } from '@/auth/selectedProfileStorage';
import { parseNativePushTapTarget } from '@/components/native-push/pushPayload';
import { clearWebPushTap, readWebPushTap } from '@/components/web-push/pushTapHandoff';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';

type PushTapSnapshot =
  | { status: 'pending' }
  | { status: 'ready'; value: unknown }
  | { status: 'discarded' };

export default function PushRoute() {
  const { tap } = useLocalSearchParams<{
    tap?: string | string[];
  }>();
  const tapKey = JSON.stringify(tap) ?? 'missing';

  return <PushTapRoute key={tapKey} tap={tap} />;
}

function PushTapRoute({ tap }: { tap?: string | string[] }) {
  const { replace } = useRouter();
  const { resetActor } = useRelayActor();
  const { accountId, selectedProfileId, status } = useSession();
  const [snapshot, setSnapshot] = useState<PushTapSnapshot>({ status: 'pending' });

  // Browser notification clicks enter through an external URL; resolve them after SessionProvider is ready.
  useEffect(() => {
    void readWebPushTap(tap).then((value) => {
      setSnapshot((current) =>
        current.status === 'pending' ? { status: 'ready', value } : current,
      );
    });
  }, [tap]);

  useEffect(() => {
    if (snapshot.status !== 'ready') {
      return;
    }

    const target = parseNativePushTapTarget(snapshot.value);
    void (async () => {
      if (status !== 'valid') {
        setSnapshot({ status: 'discarded' });
        await clearWebPushTap(tap);
        replace('/');
        return;
      }

      if (!target) {
        await clearWebPushTap(tap);
        replace('/notifications');
        return;
      }

      if (target.kind === 'operational') {
        if (accountId !== target.recipientAccountId) {
          await clearWebPushTap(tap);
          replace('/notifications');
          return;
        }

        if (target.href.kind === 'internal') {
          replace(target.href.href);
          await clearWebPushTap(tap);
        } else if (Platform.OS === 'web') {
          if (typeof window === 'undefined') {
            await clearWebPushTap(tap);
            replace('/notifications');
            return;
          }

          await clearWebPushTap(tap);
          try {
            // React Native Web Linking opens a new tab; replace this validated action URL in place.
            window.location.replace(target.href.href);
          } catch {
            replace('/notifications');
          }
        } else {
          await clearWebPushTap(tap);
          void Linking.openURL(target.href.href).catch(() => replace('/notifications'));
        }
        return;
      }

      if (selectedProfileId !== target.recipientProfileId) {
        try {
          await writeSelectedProfile(target.recipientProfileId);
          resetActor(target.recipientProfileId);
        } catch {
          await clearWebPushTap(tap);
          replace('/notifications');
          return;
        }
      }

      replace(target.href);
      await clearWebPushTap(tap);
    })();
  }, [accountId, replace, resetActor, selectedProfileId, snapshot, status, tap]);

  return null;
}
