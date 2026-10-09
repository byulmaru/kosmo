import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { useSession } from '@/session/SessionProvider';
import {
  getNativeFcmToken,
  getNativeNotificationPermissionStatus,
  getNativePushPresentationVersion,
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
import { useNativePushNotificationResponses } from './useNativePushNotificationResponses.native';
import type { PropsWithChildren } from 'react';
import type { NativePushRegisterInstallationMutation as NativePushRegisterInstallationMutationType } from './__generated__/NativePushRegisterInstallationMutation.graphql';
import type { NativePushUnregisterInstallationMutation as NativePushUnregisterInstallationMutationType } from './__generated__/NativePushUnregisterInstallationMutation.graphql';
import type { NativePushUpdateInstallationMutation as NativePushUpdateInstallationMutationType } from './__generated__/NativePushUpdateInstallationMutation.graphql';

const NativePushRegisterInstallationMutation = graphql`
  mutation NativePushRegisterInstallationMutation(
    $platform: PushInstallationPlatform!
    $presentationVersion: Int
    $token: String!
  ) {
    registerPushInstallation(
      input: { platform: $platform, presentationVersion: $presentationVersion, token: $token }
    ) {
      id
    }
  }
`;

const NativePushUpdateInstallationMutation = graphql`
  mutation NativePushUpdateInstallationMutation(
    $id: ID!
    $platform: PushInstallationPlatform!
    $presentationVersion: Int
    $token: String!
  ) {
    updatePushInstallation(
      input: {
        id: $id
        platform: $platform
        presentationVersion: $presentationVersion
        token: $token
      }
    ) {
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
const presentationVersion = getNativePushPresentationVersion();

export function NativePushProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const installationIdRef = useRef<string | null | undefined>(undefined);
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
          variables: { platform, presentationVersion, token },
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
          variables: { id, platform, presentationVersion, token },
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

  const requestPermissionAndSync = useCallback(async () => {
    await requestNativeNotificationPermission();
    await syncPermissionAndToken();
  }, [syncPermissionAndToken]);

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

  useNativePushNotificationResponses();

  return (
    <NativePushPermissionActionContext.Provider value={requestPermissionAndSync}>
      {children}
    </NativePushPermissionActionContext.Provider>
  );
}
