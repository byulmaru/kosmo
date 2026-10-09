import { getMessaging } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { NativeModules, Platform } from 'react-native';
import type { NotificationPermissionsStatus, NotificationResponse } from 'expo-notifications';
import type { NativeNotificationPermissionStatus } from './nativeNotificationPermission';

export type { NativeNotificationPermissionStatus } from './nativeNotificationPermission';

const IOS_PUSH_CATEGORY_IDENTIFIER = 'KOSMO_PUSH_PRESENTATION_V1';

export function getNativePushPresentationVersion(): 1 | 0 {
  return NativeModules.KosmoPushPresentation?.presentationVersion === 1 ? 1 : 0;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

if (Platform.OS === 'ios') {
  void Notifications.setNotificationCategoryAsync(IOS_PUSH_CATEGORY_IDENTIFIER, []).catch(() => {
    // Category registration must not block token registration or notification delivery.
  });
}

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
