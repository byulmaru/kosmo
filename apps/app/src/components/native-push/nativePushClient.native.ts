import { getMessaging } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import type { NotificationPermissionsStatus, NotificationResponse } from 'expo-notifications';
import type { NativeNotificationPermissionStatus } from './nativeNotificationPermission';

export type { NativeNotificationPermissionStatus } from './nativeNotificationPermission';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function normalizeNativeNotificationPermission(
  permission: NotificationPermissionsStatus,
): NativeNotificationPermissionStatus {
  return {
    granted:
      permission.granted ||
      permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    status: permission.status,
  };
}

export async function getNativeNotificationPermissionStatus(): Promise<NativeNotificationPermissionStatus> {
  return normalizeNativeNotificationPermission(await Notifications.getPermissionsAsync());
}

export async function requestNativeNotificationPermission(): Promise<NativeNotificationPermissionStatus> {
  return normalizeNativeNotificationPermission(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    }),
  );
}

export async function getNativeFcmToken(): Promise<string> {
  const firebaseMessaging = getMessaging();
  if (!firebaseMessaging.isDeviceRegisteredForRemoteMessages) {
    await firebaseMessaging.registerDeviceForRemoteMessages();
  }

  return firebaseMessaging.getToken();
}

export function subscribeToNativeFcmTokenRefresh(listener: (token: string) => void): () => void {
  return getMessaging().onTokenRefresh(listener);
}

export function subscribeToNativeNotificationResponses(
  listener: (response: NotificationResponse) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(listener);
  return () => subscription.remove();
}

export function getLastNativeNotificationResponse(): Promise<NotificationResponse | null> {
  return Promise.resolve(Notifications.getLastNotificationResponse());
}

export function clearLastNativeNotificationResponse(): void {
  Notifications.clearLastNotificationResponse();
}
