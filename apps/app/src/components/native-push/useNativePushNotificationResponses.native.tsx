import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
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
import {
  OTA_UPDATE_NOTIFICATION_IDENTIFIER_PREFIX,
  OTA_UPDATE_NOTIFICATION_TYPE,
} from './otaUpdateNotification';
import { parseNativePushResponseTapTarget } from './pushPayload';
import type { NotificationResponse } from 'expo-notifications';

export function useNativePushNotificationResponses(pendingOtaUpdateId: string | null) {
  const router = useRouter();
  const session = useSession();
  const { resetActor } = useRelayActor();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const tapQueueRef = useRef(Promise.resolve());

  const fallbackToNotifications = useCallback(() => {
    router.replace('/notifications');
  }, [router]);

  const handleNotificationResponse = useCallback(
    async (response: NotificationResponse) => {
      const request = response.notification.request;
      const notificationIdentifier = request.identifier;
      if (
        (request.trigger === null || request.trigger === undefined) &&
        notificationIdentifier.startsWith(OTA_UPDATE_NOTIFICATION_IDENTIFIER_PREFIX)
      ) {
        clearLastNativeNotificationResponse();
        const data = request.content.data;
        if (
          pendingOtaUpdateId &&
          typeof data === 'object' &&
          data !== null &&
          'type' in data &&
          data.type === OTA_UPDATE_NOTIFICATION_TYPE &&
          'updateId' in data &&
          data.updateId === pendingOtaUpdateId &&
          notificationIdentifier ===
            `${OTA_UPDATE_NOTIFICATION_IDENTIFIER_PREFIX}${pendingOtaUpdateId}`
        ) {
          await Updates.reloadAsync().catch(() => undefined);
        }
        return;
      }

      const currentSession = sessionRef.current;
      if (currentSession.status !== 'valid') {
        clearLastNativeNotificationResponse();
        router.replace('/');
        return;
      }

      const envelope = parseNativePushResponseTapTarget(response);
      if (!envelope) {
        clearLastNativeNotificationResponse();
        fallbackToNotifications();
        return;
      }

      if (envelope.kind === 'operational') {
        clearLastNativeNotificationResponse();
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
        clearLastNativeNotificationResponse();
        fallbackToNotifications();
        return;
      }

      clearLastNativeNotificationResponse();
      router.replace(envelope.href);
    },
    [fallbackToNotifications, pendingOtaUpdateId, resetActor, router],
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
