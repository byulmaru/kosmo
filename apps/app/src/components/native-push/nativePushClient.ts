import type { NativeNotificationPermissionStatus } from './nativeNotificationPermission';

export type { NativeNotificationPermissionStatus } from './nativeNotificationPermission';

export function getNativeNotificationPermissionStatus(): Promise<NativeNotificationPermissionStatus> {
  return Promise.resolve({ granted: false });
}

export function requestNativeNotificationPermission(): Promise<NativeNotificationPermissionStatus> {
  return Promise.resolve({ granted: false });
}

export function getNativeFcmToken(): Promise<string> {
  return Promise.reject(new Error('Native push is unavailable on this platform.'));
}

export function subscribeToNativeFcmTokenRefresh(listener: (token: string) => void): () => void {
  void listener;
  return () => undefined;
}

export function subscribeToNativeNotificationResponses(
  listener: (response: unknown) => void,
): () => void {
  void listener;
  return () => undefined;
}

export async function getLastNativeNotificationResponse(): Promise<unknown | null> {
  return null;
}

export function clearLastNativeNotificationResponse(): void {
  return undefined;
}
