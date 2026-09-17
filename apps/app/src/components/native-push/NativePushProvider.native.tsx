import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useMutation, useRelayEnvironment } from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import {
  clearLastNativeNotificationResponse,
  getLastNativeNotificationResponse,
  getNativeFcmToken,
  getNativeNotificationPermissionStatus,
  requestNativeNotificationPermission,
  subscribeToNativeFcmTokenRefresh,
  subscribeToNativeNotificationResponses,
} from './nativePushClient';
import {
  NativePushNotificationTargetQuery,
  NativePushRegisterInstallationMutation,
  NativePushSelectProfileMutation,
  NativePushUnregisterInstallationMutation,
  NativePushUpdateInstallationMutation,
} from './nativePushOperations';
import { unregisterDeniedPushInstallation } from './pushInstallationLifecycle';
import { prepareNativePushNavigation } from './pushNavigation';
import {
  nativePushResponseKey,
  notificationDataFromResponse,
  parseNativePushTapTarget,
} from './pushPayload';
import { acceptNativePushPrompt } from './pushPrompt';
import {
  deletePushInstallationId,
  markPushPromptComplete,
  readPushInstallationId,
  readPushPromptComplete,
  writePushInstallationId,
} from './pushStorage';
import type { NativePushNotificationTargetQuery as NativePushNotificationTargetQueryType } from './__generated__/NativePushNotificationTargetQuery.graphql';
import type { NativePushRegisterInstallationMutation as NativePushRegisterInstallationMutationType } from './__generated__/NativePushRegisterInstallationMutation.graphql';
import type { NativePushSelectProfileMutation as NativePushSelectProfileMutationType } from './__generated__/NativePushSelectProfileMutation.graphql';
import type { NativePushUnregisterInstallationMutation as NativePushUnregisterInstallationMutationType } from './__generated__/NativePushUnregisterInstallationMutation.graphql';
import type { NativePushUpdateInstallationMutation as NativePushUpdateInstallationMutationType } from './__generated__/NativePushUpdateInstallationMutation.graphql';

type PushMutationFailure = Error & { retryable: boolean };

const makeMutationFailure = (message: string, retryable: boolean): PushMutationFailure => {
  const error = new Error(message) as PushMutationFailure;
  error.retryable = retryable;
  return error;
};

const isPushMutationFailure = (error: unknown): error is PushMutationFailure =>
  error instanceof Error && 'retryable' in error;

const platform = Platform.OS === 'ios' ? ('IOS' as const) : ('ANDROID' as const);

function isPermissionGranted(status: { granted: boolean; ios?: { status?: number } }): boolean {
  return status.granted || status.ios?.status === 3;
}

export function NativePushProvider() {
  const theme = useTheme();
  const router = useRouter();
  const environment = useRelayEnvironment();
  const session = useSession();
  const { resetActor } = useRelayActor();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const selectedProfileIdRef = useRef(session.selectedProfileId);
  selectedProfileIdRef.current = session.selectedProfileId;
  const installationIdRef = useRef<string | null | undefined>(undefined);
  const tokenSyncQueueRef = useRef(Promise.resolve());
  const tapQueueRef = useRef(Promise.resolve());
  const handledResponseKeysRef = useRef(new Set<string>());
  const promptAttemptedRef = useRef(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptPending, setPromptPending] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [commitRegister] = useMutation<NativePushRegisterInstallationMutationType>(
    NativePushRegisterInstallationMutation,
  );
  const [commitUpdate] = useMutation<NativePushUpdateInstallationMutationType>(
    NativePushUpdateInstallationMutation,
  );
  const [commitUnregister] = useMutation<NativePushUnregisterInstallationMutationType>(
    NativePushUnregisterInstallationMutation,
  );
  const [commitSelectProfile] = useMutation<NativePushSelectProfileMutationType>(
    NativePushSelectProfileMutation,
  );

  const registerInstallation = useCallback(
    (token: string) =>
      new Promise<string>((resolve, reject) => {
        commitRegister({
          onCompleted: (response, errors) => {
            if (errors?.length) {
              reject(makeMutationFailure('Push installation register failed.', false));
              return;
            }

            resolve(response.registerPushInstallation.id);
          },
          onError: (error) => reject(makeMutationFailure(error.message, true)),
          variables: { platform, token },
        });
      }),
    [commitRegister],
  );

  const updateInstallation = useCallback(
    (id: string, token: string) =>
      new Promise<void>((resolve, reject) => {
        commitUpdate({
          onCompleted: (response, errors) => {
            if (errors?.length || !response.updatePushInstallation.completed) {
              reject(makeMutationFailure('Push installation update failed.', false));
              return;
            }

            resolve();
          },
          onError: (error) => reject(makeMutationFailure(error.message, true)),
          variables: { id, platform, token },
        });
      }),
    [commitUpdate],
  );

  const unregisterInstallation = useCallback(
    (id: string) =>
      new Promise<void>((resolve, reject) => {
        commitUnregister({
          onCompleted: (response, errors) => {
            if (errors?.length || !response.unregisterPushInstallation.completed) {
              reject(makeMutationFailure('Push installation unregister failed.', false));
              return;
            }

            resolve();
          },
          onError: (error) => reject(makeMutationFailure(error.message, true)),
          variables: { id },
        });
      }),
    [commitUnregister],
  );

  const syncToken = useCallback(
    async (token: string) => {
      if (!token || sessionRef.current.status !== 'valid') {
        return;
      }

      if (installationIdRef.current === undefined) {
        installationIdRef.current = await readPushInstallationId();
      }

      const installationId = installationIdRef.current;
      if (installationId) {
        try {
          await updateInstallation(installationId, token);
          return;
        } catch (error) {
          if (isPushMutationFailure(error) && error.retryable) {
            throw error;
          }
        }
      }

      const registeredId = await registerInstallation(token);
      installationIdRef.current = registeredId;
      await writePushInstallationId(registeredId);
    },
    [registerInstallation, updateInstallation],
  );

  const enqueueTokenSync = useCallback(
    (token: string) => {
      const next = tokenSyncQueueRef.current.then(() => syncToken(token));
      tokenSyncQueueRef.current = next.catch(() => undefined);
      return next;
    },
    [syncToken],
  );

  const syncPermissionAndToken = useCallback(
    async (refreshedToken?: string) => {
      if (sessionRef.current.status !== 'valid') {
        return;
      }

      const status = await getNativeNotificationPermissionStatus();
      if (!isPermissionGranted(status)) {
        if (status.status !== 'denied') {
          return;
        }

        if (installationIdRef.current === undefined) {
          installationIdRef.current = await readPushInstallationId();
        }

        const installationId = installationIdRef.current;
        if (!installationId) {
          return;
        }

        const unregistered = await unregisterDeniedPushInstallation({
          deleteInstallationId: deletePushInstallationId,
          installationId,
          unregisterInstallation,
        });
        if (unregistered) {
          installationIdRef.current = null;
        }
        return;
      }

      const token = refreshedToken ?? (await getNativeFcmToken());
      await enqueueTokenSync(token);
    },
    [enqueueTokenSync, unregisterInstallation],
  );

  useEffect(() => {
    if (session.status !== 'valid') {
      promptAttemptedRef.current = false;
      setPromptError(null);
      setPromptVisible(false);
      return;
    }

    let active = true;
    void readPushPromptComplete()
      .then((complete) => {
        if (!active) {
          return;
        }
        setPromptVisible(!complete);
      })
      .catch(() => {
        if (active) {
          setPromptVisible(true);
        }
      });

    return () => {
      active = false;
    };
  }, [session.status]);

  useEffect(() => {
    if (session.status !== 'valid') {
      installationIdRef.current = undefined;
      return;
    }

    const unsubscribe = subscribeToNativeFcmTokenRefresh((token) => {
      void syncPermissionAndToken(token).catch(() => undefined);
    });

    void syncPermissionAndToken().catch(() => undefined);

    return () => {
      unsubscribe();
    };
  }, [session.status, syncPermissionAndToken]);

  const handlePromptClose = useCallback(() => {
    if (promptPending || promptAttemptedRef.current) {
      return;
    }

    promptAttemptedRef.current = true;
    setPromptVisible(false);
    void markPushPromptComplete().catch(() => undefined);
  }, [promptPending]);

  const handlePromptAccept = useCallback(async () => {
    if (promptPending || promptAttemptedRef.current) {
      return;
    }

    setPromptPending(true);
    setPromptError(null);
    try {
      await acceptNativePushPrompt({
        markPromptComplete: markPushPromptComplete,
        onCompleted: () => {
          promptAttemptedRef.current = true;
          setPromptVisible(false);
        },
        requestPermission: requestNativeNotificationPermission,
        syncPermissionAndToken,
      });
    } catch {
      setPromptError('알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPromptPending(false);
    }
  }, [promptPending, syncPermissionAndToken]);

  const fallbackToNotifications = useCallback(() => {
    router.replace('/notifications');
  }, [router]);

  const selectProfile = useCallback(
    (id: string) =>
      new Promise<string>((resolve, reject) => {
        commitSelectProfile({
          onCompleted: (response, errors) => {
            if (errors?.length) {
              reject(makeMutationFailure('Profile selection failed.', false));
              return;
            }

            resolve(response.selectProfile.profile.id);
          },
          onError: (error) => reject(makeMutationFailure(error.message, true)),
          variables: { id },
        });
      }),
    [commitSelectProfile],
  );

  const revalidateNotificationTarget = useCallback(
    (notificationId: string) =>
      new Promise<NativePushNotificationTargetQueryType['response']['node']>((resolve, reject) => {
        let result: NativePushNotificationTargetQueryType['response'] | undefined;
        fetchQuery(
          environment,
          NativePushNotificationTargetQuery,
          { notificationId },
          { fetchPolicy: 'network-only' },
        ).subscribe({
          complete: () => {
            if (result) {
              resolve(result.node);
            } else {
              reject(new Error('Push notification target query returned no data.'));
            }
          },
          error: reject,
          next: (value) => {
            result = value as NativePushNotificationTargetQueryType['response'];
          },
        });
      }),
    [environment],
  );

  const markResponseHandled = useCallback((response: unknown) => {
    const key = nativePushResponseKey(response);
    if (key) {
      handledResponseKeysRef.current.add(key);
    }
    clearLastNativeNotificationResponse();
  }, []);

  const handleNotificationResponse = useCallback(
    async (response: unknown) => {
      const key = nativePushResponseKey(response);
      if (key && handledResponseKeysRef.current.has(key)) {
        return;
      }

      const currentSession = sessionRef.current;
      if (currentSession.status !== 'valid') {
        markResponseHandled(response);
        router.replace('/');
        return;
      }

      const envelope = parseNativePushTapTarget(notificationDataFromResponse(response));
      if (!envelope) {
        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      let node: NativePushNotificationTargetQueryType['response']['node'];
      try {
        node = await revalidateNotificationTarget(envelope.notificationId);
      } catch {
        return;
      }

      if (sessionRef.current.status !== 'valid') {
        markResponseHandled(response);
        router.replace('/');
        return;
      }

      let targetHref: Awaited<ReturnType<typeof prepareNativePushNavigation>>;
      try {
        targetHref = await prepareNativePushNavigation({
          node,
          recipientProfileId: envelope.recipientProfileId,
          resetActor,
          selectProfile,
          selectedProfileId: selectedProfileIdRef.current,
        });
      } catch (error) {
        if (isPushMutationFailure(error) && error.retryable) {
          return;
        }

        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      if (!targetHref) {
        markResponseHandled(response);
        fallbackToNotifications();
        return;
      }

      markResponseHandled(response);
      router.replace(targetHref);
    },
    [
      fallbackToNotifications,
      markResponseHandled,
      revalidateNotificationTarget,
      resetActor,
      router,
      selectProfile,
    ],
  );

  const enqueueNotificationResponse = useCallback(
    (response: unknown) => {
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

      void syncPermissionAndToken().catch(() => undefined);
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
  }, [enqueueNotificationResponse, syncPermissionAndToken]);

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={handlePromptClose}
      transparent
      visible={promptVisible}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.overlayScrim }]}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElevated }]}>
          <Text style={[styles.title, { color: theme.text }]}>알림을 받아보세요</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            팔로우, 반응과 답글 소식을 놓치지 않도록 Push 알림을 사용할 수 있어요.
          </Text>
          <Button
            disabled={promptPending}
            loading={promptPending}
            loadingText="권한 요청 중"
            onPress={() => void handlePromptAccept()}
            testID="native-push-accept"
          >
            알림 받기
          </Button>
          <Button
            disabled={promptPending}
            onPress={handlePromptClose}
            size="compact"
            testID="native-push-dismiss"
            tone="secondary"
          >
            나중에
          </Button>
          {promptError ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
              {promptError}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    gap: 16,
    maxWidth: 420,
    padding: 24,
    width: '100%',
  },
  title: { fontSize: 20, fontWeight: '700' },
  description: { fontSize: 16, lineHeight: 24 },
  error: { fontSize: 14, lineHeight: 20 },
});
