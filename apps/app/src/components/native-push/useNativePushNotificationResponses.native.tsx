import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import { writeSelectedProfile } from '@/auth/selectedProfileStorage';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import {
  clearLastNativeNotificationResponse,
  getLastNativeNotificationResponse,
  subscribeToNativeNotificationResponses,
} from './nativePushClient';
import { nativePushResponseKey, parseNativePushTapTarget } from './pushPayload';
import type { NotificationResponse } from 'expo-notifications';

export function useNativePushNotificationResponses() {
  const router = useRouter();
  const session = useSession();
  const { resetActor } = useRelayActor();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const tapQueueRef = useRef(Promise.resolve());
  const handledResponseKeyRef = useRef<string | null>(null);

  const fallbackToNotifications = useCallback(() => {
    router.replace('/notifications');
  }, [router]);

  const markResponseHandled = useCallback((response: NotificationResponse) => {
    handledResponseKeyRef.current = nativePushResponseKey(response);
    clearLastNativeNotificationResponse();
  }, []);

  const handleNotificationResponse = useCallback(
    async (response: NotificationResponse) => {
      const key = nativePushResponseKey(response);
      if (key && key === handledResponseKeyRef.current) {
        return;
      }

      const currentSession = sessionRef.current;
      if (currentSession.status !== 'valid') {
        markResponseHandled(response);
        router.replace('/');
        return;
      }

      const envelope = parseNativePushTapTarget(response.notification.request.content.data);
      if (!envelope) {
        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      if (envelope.kind === 'operational') {
        markResponseHandled(response);
        if (currentSession.accountId !== envelope.recipientAccountId) {
          fallbackToNotifications();
          return;
        }

        if (envelope.href.kind === 'internal') {
          router.replace(envelope.href.href);
        } else {
          try {
            await Linking.openURL(envelope.href.href);
          } catch {
            fallbackToNotifications();
          }
        }
        return;
      }

      try {
        if (sessionRef.current.selectedProfileId !== envelope.recipientProfileId) {
          await writeSelectedProfile(envelope.recipientProfileId);
          resetActor(envelope.recipientProfileId);
        }
      } catch {
        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      markResponseHandled(response);
      router.replace(envelope.href);
    },
    [fallbackToNotifications, markResponseHandled, resetActor, router],
  );

  const enqueueNotificationResponse = useCallback(
    (response: NotificationResponse) => {
      const next = tapQueueRef.current.then(() => handleNotificationResponse(response));
      tapQueueRef.current = next.catch(() => undefined);
    },
    [handleNotificationResponse],
  );

  useEffect(() => {
    const unsubscribe = subscribeToNativeNotificationResponses(enqueueNotificationResponse);
    void getLastNativeNotificationResponse().then((response) => {
      if (response) {
        enqueueNotificationResponse(response);
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }

      void getLastNativeNotificationResponse().then((response) => {
        if (response) {
          enqueueNotificationResponse(response);
        }
      });
    });

    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [enqueueNotificationResponse]);
}
