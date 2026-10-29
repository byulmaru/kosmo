import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useMutation } from 'react-relay';
import { getPublicConfig } from '@/config/public';
import { useSession } from '@/session/SessionProvider';
import {
  deletePushInstallationId,
  readPushInstallationId,
  writePushInstallationId,
} from './pushStorage';
import { WebPushPermissionContext } from './webPushPermissionContext';
import type { PropsWithChildren } from 'react';
import type { WebPushRegisterInstallationMutation as WebPushRegisterInstallationMutationType } from './__generated__/WebPushRegisterInstallationMutation.graphql';
import type { WebPushUnregisterInstallationMutation as WebPushUnregisterInstallationMutationType } from './__generated__/WebPushUnregisterInstallationMutation.graphql';
import type { WebPushUpdateInstallationMutation as WebPushUpdateInstallationMutationType } from './__generated__/WebPushUpdateInstallationMutation.graphql';
import type { WebPushSupport } from './webPushPermissionContext';

const WebPushRegisterInstallationMutation = graphql`
  mutation WebPushRegisterInstallationMutation(
    $platform: PushInstallationPlatform!
    $token: String!
  ) {
    registerPushInstallation(input: { platform: $platform, token: $token }) {
      id
    }
  }
`;

const WebPushUpdateInstallationMutation = graphql`
  mutation WebPushUpdateInstallationMutation(
    $id: ID!
    $platform: PushInstallationPlatform!
    $token: String!
  ) {
    updatePushInstallation(input: { id: $id, platform: $platform, token: $token }) {
      completed
    }
  }
`;

const WebPushUnregisterInstallationMutation = graphql`
  mutation WebPushUnregisterInstallationMutation($id: ID!) {
    unregisterPushInstallation(input: { id: $id }) {
      completed
    }
  }
`;

type WebPushResources = {
  isActive: () => boolean;
  register: () => Promise<void>;
  unregister: () => Promise<void>;
};

export function NativePushProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const webPush = getPublicConfig('webPush');
  const [permission, setPermission] = useState(readBrowserNotificationPermission);
  const [support, setSupport] = useState<WebPushSupport>('checking');
  // Firebase and Service Worker handles are external resources used by event callbacks.
  const resources = useRef<WebPushResources | null>(null);
  const [commitRegister] = useMutation<WebPushRegisterInstallationMutationType>(
    WebPushRegisterInstallationMutation,
  );
  const [commitUpdate] = useMutation<WebPushUpdateInstallationMutationType>(
    WebPushUpdateInstallationMutation,
  );
  const [commitUnregister] = useMutation<WebPushUnregisterInstallationMutationType>(
    WebPushUnregisterInstallationMutation,
  );

  const registerInstallation = useCallback(
    (token: string) => {
      commitRegister({
        onCompleted: (response, errors) => {
          if (errors?.length) {
            return;
          }

          if (readBrowserNotificationPermission() !== 'granted') {
            commitUnregister({
              onCompleted: () => undefined,
              onError: () => undefined,
              variables: { id: response.registerPushInstallation.id },
            });
            return;
          }

          void writePushInstallationId(response.registerPushInstallation.id).catch(() => undefined);
        },
        onError: () => undefined,
        variables: { platform: 'WEB', token },
      });
    },
    [commitRegister, commitUnregister],
  );

  const syncInstallation = useCallback(
    (token: string) => {
      const register = () => registerInstallation(token);
      void readPushInstallationId()
        .then((id) => {
          if (!id) {
            register();
            return;
          }

          commitUpdate({
            onCompleted: (response, errors) => {
              if (errors?.length || !response.updatePushInstallation.completed) {
                register();
              }
            },
            onError: register,
            variables: { id, platform: 'WEB', token },
          });
        })
        .catch(register);
    },
    [commitUpdate, registerInstallation],
  );

  const unregisterInstallation = useCallback(() => {
    void readPushInstallationId()
      .then((id) => {
        if (!id) {
          return;
        }

        commitUnregister({
          onCompleted: (response, errors) => {
            if (!errors?.length && response.unregisterPushInstallation.completed) {
              void deletePushInstallationId().catch(() => undefined);
            }
          },
          onError: () => undefined,
          variables: { id },
        });
      })
      .catch(() => undefined);
  }, [commitUnregister]);

  useEffect(() => {
    // Firebase listeners and browser lifecycle events are external resources; remove them when the authenticated session changes.
    let active = true;
    let unsubscribeFromMessages: () => void = () => {};
    let unsubscribeFromRegistration: () => void = () => {};
    resources.current = null;
    setSupport('checking');

    if (session.status !== 'valid') {
      setSupport('unavailable');
      return () => {
        active = false;
      };
    }

    const initialPermission = readBrowserNotificationPermission();
    setPermission(initialPermission);
    if (initialPermission === 'denied') {
      unregisterInstallation();
    }

    const syncPermissionFromBrowser = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      const nextPermission = readBrowserNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission === 'denied') {
        unregisterInstallation();
      }
      if (resources.current) {
        void syncMessagingPermission(resources.current, nextPermission).catch(() => undefined);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncPermissionFromBrowser);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', syncPermissionFromBrowser);
    }

    if (!webPush) {
      setSupport('unavailable');
      return () => {
        active = false;
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', syncPermissionFromBrowser);
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', syncPermissionFromBrowser);
        }
      };
    }

    void (async () => {
      const [appSdk, messagingSdk] = await Promise.all([
        import('firebase/app'),
        import('firebase/messaging'),
      ]);
      if (!(await messagingSdk.isSupported())) {
        if (active) {
          const standalone =
            typeof navigator === 'undefined'
              ? undefined
              : (navigator as Navigator & { standalone?: boolean }).standalone;
          setSupport(standalone === false ? 'installation-required' : 'unsupported');
        }
        return;
      }
      if (!active) {
        return;
      }

      const { apiKey, appId, messagingSenderId, projectId, vapidKey } = webPush;
      const firebaseConfig = { apiKey, appId, messagingSenderId, projectId };
      const app =
        appSdk.getApps().find((candidate) => candidate.name === 'kosmo-web-push') ??
        appSdk.initializeApp(firebaseConfig, 'kosmo-web-push');
      const messaging = messagingSdk.getMessaging(app);
      const serviceWorkerUrl = new URL('/firebase-messaging-sw.js', globalThis.location.origin);
      serviceWorkerUrl.searchParams.set('firebase', JSON.stringify(firebaseConfig));
      const serviceWorkerRegistration = await navigator.serviceWorker.register(
        serviceWorkerUrl.toString(),
        { scope: '/' },
      );
      if (!active) {
        return;
      }

      unsubscribeFromMessages = messagingSdk.onMessage(messaging, (payload) => {
        if (!active || !payload.data) {
          return;
        }

        const { body, href, notificationId, recipientAccountId, recipientProfileId, title } =
          payload.data;
        if (!title || !notificationId) {
          return;
        }

        void serviceWorkerRegistration
          .showNotification(title, {
            ...(typeof body === 'string' ? { body } : {}),
            data: {
              notificationId,
              ...(typeof href === 'string' ? { href } : {}),
              ...(typeof recipientProfileId === 'string' ? { recipientProfileId } : {}),
              ...(typeof recipientAccountId === 'string' ? { recipientAccountId } : {}),
            },
            tag: notificationId,
          })
          .catch(() => undefined);
      });
      unsubscribeFromRegistration = messagingSdk.onRegistered(messaging, (fid) => {
        if (active && readBrowserNotificationPermission() === 'granted') {
          syncInstallation(fid);
        }
      });

      const messagingResources: WebPushResources = {
        isActive: () => active,
        register: () =>
          messagingSdk.register(messaging, {
            serviceWorkerRegistration,
            vapidKey,
          }),
        unregister: () => messagingSdk.unregister(messaging),
      };
      resources.current = messagingResources;
      setSupport('supported');
      void syncMessagingPermission(messagingResources, readBrowserNotificationPermission()).catch(
        () => undefined,
      );
    })().catch(() => {
      if (active) {
        setSupport('unavailable');
      }
    });

    return () => {
      active = false;
      resources.current = null;
      unsubscribeFromMessages();
      unsubscribeFromRegistration();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', syncPermissionFromBrowser);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', syncPermissionFromBrowser);
      }
    };
  }, [session.accountId, session.status, syncInstallation, unregisterInstallation, webPush]);

  const syncPermission = useCallback(
    async (nextPermission: NotificationPermission) => {
      setPermission(nextPermission);
      if (nextPermission === 'denied') {
        unregisterInstallation();
      }
      if (nextPermission === 'default') {
        return;
      }
      const currentResources = resources.current;
      if (!currentResources || !currentResources.isActive()) {
        if (nextPermission === 'denied') {
          return;
        }
        throw new Error('Web Push is unavailable.');
      }

      await syncMessagingPermission(currentResources, nextPermission);
    },
    [unregisterInstallation],
  );

  return (
    <WebPushPermissionContext.Provider value={{ permission, support, syncPermission }}>
      {children}
    </WebPushPermissionContext.Provider>
  );
}

async function syncMessagingPermission(
  resources: WebPushResources,
  permission: NotificationPermission,
): Promise<void> {
  if (permission === 'granted') {
    await resources.register();
  } else if (permission === 'denied') {
    await resources.unregister();
  }
}

function readBrowserNotificationPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}
