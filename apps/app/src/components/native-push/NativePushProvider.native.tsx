import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { useSession } from '@/session/SessionProvider';
import {
  getNativeFcmToken,
  getNativeNotificationPermissionStatus,
  requestNativeNotificationPermission,
  subscribeToNativeFcmTokenRefresh,
} from './nativePushClient';
import { NativePushPermissionActionContext } from './nativePushPermissionContext';
import {
  syncPushInstallationToken,
  unregisterDeniedPushInstallation,
} from './pushInstallationLifecycle';
import {
  deletePushInstallationId,
  readPushInstallationId,
  writePushInstallationId,
} from './pushStorage';
import {
  OTA_UPDATE_NOTIFICATION_IDENTIFIER_PREFIX,
  useNativePushNotificationResponses,
} from './useNativePushNotificationResponses.native';
import type { PropsWithChildren } from 'react';
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
const LAST_NOTIFIED_OTA_UPDATE_ID_KEY = '@kosmo/native-updates/last-notified-update-id';

export function NativePushProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const { downloadedUpdate, isUpdatePending } = Updates.useUpdates();
  const pendingOtaUpdateId =
    isUpdatePending && downloadedUpdate?.type === Updates.UpdateInfoType.NEW
      ? downloadedUpdate.updateId
      : null;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const installationIdRef = useRef<string | null | undefined>(undefined);
  const hasRunInitialPermissionSyncRef = useRef(false);
  const tokenSyncQueueRef = useRef(Promise.resolve());
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
    async (refreshedToken?: string, requestIfUndetermined = false) => {
      if (sessionRef.current.status !== 'valid') {
        return;
      }

      let status = await getNativeNotificationPermissionStatus();
      if (sessionRef.current.status !== 'valid') {
        return;
      }
      if (status.status === 'undetermined' && requestIfUndetermined) {
        status = await requestNativeNotificationPermission();
        if (sessionRef.current.status !== 'valid') {
          return;
        }
      }
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

  const requestPermissionAndSync = useCallback(async () => {
    await requestNativeNotificationPermission();
    await syncPermissionAndToken();
  }, [syncPermissionAndToken]);

  useEffect(() => {
    if (session.status !== 'valid') {
      installationIdRef.current = undefined;
      hasRunInitialPermissionSyncRef.current = false;
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

    const requestIfUndetermined = !hasRunInitialPermissionSyncRef.current;
    hasRunInitialPermissionSyncRef.current = true;
    void syncPermissionAndToken(undefined, requestIfUndetermined).catch(() => undefined);

    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [session.status, syncPermissionAndToken]);

  useEffect(() => {
    if (!pendingOtaUpdateId) {
      return;
    }

    // This effect synchronizes Expo's native update snapshot with the OS notification center.
    void AsyncStorage.getItem(LAST_NOTIFIED_OTA_UPDATE_ID_KEY)
      .then(async (lastNotifiedUpdateId) => {
        if (lastNotifiedUpdateId === pendingOtaUpdateId) {
          return;
        }
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '업데이트가 준비되었어요.',
            body: '누르면 앱을 재시작해 적용합니다.',
          },
          identifier: `${OTA_UPDATE_NOTIFICATION_IDENTIFIER_PREFIX}${pendingOtaUpdateId}`,
          trigger: null,
        });
        await AsyncStorage.setItem(LAST_NOTIFIED_OTA_UPDATE_ID_KEY, pendingOtaUpdateId);
      })
      .catch(() => undefined);
  }, [pendingOtaUpdateId]);

  useNativePushNotificationResponses(pendingOtaUpdateId);

  return (
    <NativePushPermissionActionContext.Provider value={requestPermissionAndSync}>
      {children}
    </NativePushPermissionActionContext.Provider>
  );
}
