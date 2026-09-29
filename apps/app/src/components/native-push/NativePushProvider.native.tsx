import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import {
  getNativeFcmToken,
  getNativeNotificationPermissionStatus,
  requestNativeNotificationPermission,
  subscribeToNativeFcmTokenRefresh,
} from './nativePushClient';
import {
  syncPushInstallationToken,
  unregisterDeniedPushInstallation,
} from './pushInstallationLifecycle';
import { acceptNativePushPrompt } from './pushPrompt';
import {
  deletePushInstallationId,
  markPushPromptComplete,
  readPushInstallationId,
  readPushPromptComplete,
  writePushInstallationId,
} from './pushStorage';
import { useNativePushNotificationResponses } from './useNativePushNotificationResponses.native';
import type { NativePushRegisterInstallationMutation as NativePushRegisterInstallationMutationType } from './__generated__/NativePushRegisterInstallationMutation.graphql';
import type { NativePushUnregisterInstallationMutation as NativePushUnregisterInstallationMutationType } from './__generated__/NativePushUnregisterInstallationMutation.graphql';
import type { NativePushUpdateInstallationMutation as NativePushUpdateInstallationMutationType } from './__generated__/NativePushUpdateInstallationMutation.graphql';

const NativePushRegisterInstallationMutation = graphql`
  mutation NativePushRegisterInstallationMutation(
    $platform: PushInstallationPlatform!
    $token: String!
  ) {
    registerPushInstallation(input: { platform: $platform, token: $token }) {
      id
    }
  }
`;

const NativePushUpdateInstallationMutation = graphql`
  mutation NativePushUpdateInstallationMutation(
    $id: ID!
    $platform: PushInstallationPlatform!
    $token: String!
  ) {
    updatePushInstallation(input: { id: $id, platform: $platform, token: $token }) {
      completed
    }
  }
`;

const NativePushUnregisterInstallationMutation = graphql`
  mutation NativePushUnregisterInstallationMutation($id: ID!) {
    unregisterPushInstallation(input: { id: $id }) {
      completed
    }
  }
`;

const platform = Platform.OS === 'ios' ? ('IOS' as const) : ('ANDROID' as const);

export function NativePushProvider() {
  const theme = useTheme();
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const installationIdRef = useRef<string | null | undefined>(undefined);
  const tokenSyncQueueRef = useRef(Promise.resolve());
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

  const registerInstallation = useCallback(
    (token: string) =>
      new Promise<string>((resolve, reject) => {
        commitRegister({
          onCompleted: (response, errors) => {
            if (errors?.length) {
              reject(errors[0]);
              return;
            }

            resolve(response.registerPushInstallation.id);
          },
          onError: reject,
          variables: { platform, token },
        });
      }),
    [commitRegister],
  );

  const updateInstallation = useCallback(
    (id: string, token: string) =>
      new Promise<void>((resolve, reject) => {
        commitUpdate({
          onCompleted: (_response, errors) => {
            if (errors?.length) {
              reject(errors[0]);
              return;
            }

            resolve();
          },
          onError: reject,
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
            if (errors?.length) {
              reject(errors[0]);
              return;
            }
            if (!response.unregisterPushInstallation.completed) {
              reject(new Error('Push installation unregister failed.'));
              return;
            }

            resolve();
          },
          onError: reject,
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
      const syncedId = await syncPushInstallationToken({
        installationId,
        registerInstallation,
        token,
        updateInstallation,
      });
      if (syncedId !== installationId) {
        installationIdRef.current = syncedId;
        await writePushInstallationId(syncedId);
      }
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
      if (!status.granted) {
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
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPermissionAndToken().catch(() => undefined);
      }
    });

    void syncPermissionAndToken().catch(() => undefined);

    return () => {
      unsubscribe();
      appStateSubscription.remove();
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

  useNativePushNotificationResponses();

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
