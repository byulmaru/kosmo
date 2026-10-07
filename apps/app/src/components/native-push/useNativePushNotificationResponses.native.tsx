import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import {
  clearLastNativeNotificationResponse,
  getLastNativeNotificationResponse,
  subscribeToNativeNotificationResponses,
} from './nativePushClient';
import { prepareNativePushNavigation } from './pushNavigation';
import { nativePushResponseKey, parseNativePushTapTarget } from './pushPayload';
import type { NotificationResponse } from 'expo-notifications';
import type { NativePushSelectProfileMutation as NativePushSelectProfileMutationType } from './__generated__/NativePushSelectProfileMutation.graphql';

const NativePushSelectProfileMutation = graphql`
  mutation NativePushSelectProfileMutation($id: ID!) {
    selectProfile(input: { id: $id }) {
      profile {
        id
      }
    }
  }
`;

type RetryablePushError = Error & { retryable: true };

const markRetryable = (error: Error): RetryablePushError =>
  Object.assign(error, { retryable: true as const });

const isRetryablePushError = (error: unknown): error is RetryablePushError =>
  error instanceof Error && 'retryable' in error && error.retryable === true;

export function useNativePushNotificationResponses() {
  const router = useRouter();
  const session = useSession();
  const { resetActor } = useRelayActor();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const tapQueueRef = useRef(Promise.resolve());
  const handledResponseKeyRef = useRef<string | null>(null);
  const [commitSelectProfile] = useMutation<NativePushSelectProfileMutationType>(
    NativePushSelectProfileMutation,
  );

  const fallbackToNotifications = useCallback(() => {
    router.replace('/notifications');
  }, [router]);

  const selectProfile = useCallback(
    (id: string) =>
      new Promise<string>((resolve, reject) => {
        commitSelectProfile({
          onCompleted: (response, errors) => {
            if (errors?.length) {
              reject(errors[0]);
              return;
            }

            resolve(response.selectProfile.profile.id);
          },
          onError: (error) => reject(markRetryable(error)),
          variables: { id },
        });
      }),
    [commitSelectProfile],
  );

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
      if (currentSession.status !== 'valid' && currentSession.status !== 'operational') {
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

      if (currentSession.status === 'operational') {
        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      let targetHref: Awaited<ReturnType<typeof prepareNativePushNavigation>>;
      try {
        targetHref = await prepareNativePushNavigation({
          href: envelope.href,
          recipientProfileId: envelope.recipientProfileId,
          resetActor,
          selectProfile,
          selectedProfileId: sessionRef.current.selectedProfileId,
        });
      } catch (error) {
        if (isRetryablePushError(error)) {
          return;
        }

        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      markResponseHandled(response);
      router.replace(targetHref);
    },
    [fallbackToNotifications, markResponseHandled, resetActor, router, selectProfile],
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
