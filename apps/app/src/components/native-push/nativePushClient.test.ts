import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import type * as NativePushClientWebModule from './nativePushClient';
import type * as NativePushClientNativeModule from './nativePushClient.native';

type Permission = {
  granted: boolean;
  ios?: { status: number };
  status: 'undetermined' | 'denied' | 'granted';
};

let currentPermission: Permission = { granted: false, status: 'undetermined' };
let requestedPermission: Permission = { granted: false, status: 'undetermined' };

mock.module('@react-native-firebase/messaging', {
  exports: { getMessaging: () => ({}) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-notifications', {
  exports: {
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    getPermissionsAsync: () => Promise.resolve(currentPermission),
    requestPermissionsAsync: () => Promise.resolve(requestedPermission),
    setNotificationHandler: () => undefined,
  },
} as unknown as Parameters<typeof mock.module>[1]);

let getNativeNotificationPermissionStatus: typeof NativePushClientNativeModule.getNativeNotificationPermissionStatus;
let requestNativeNotificationPermission: typeof NativePushClientNativeModule.requestNativeNotificationPermission;
let getWebNotificationPermissionStatus: typeof NativePushClientWebModule.getNativeNotificationPermissionStatus;
let requestWebNotificationPermission: typeof NativePushClientWebModule.requestNativeNotificationPermission;

before(async () => {
  ({ getNativeNotificationPermissionStatus, requestNativeNotificationPermission } =
    await import('./nativePushClient.native'));
  ({
    getNativeNotificationPermissionStatus: getWebNotificationPermissionStatus,
    requestNativeNotificationPermission: requestWebNotificationPermission,
  } = await import('./nativePushClient'));
});

describe('native notification permission adapter', () => {
  it('treats iOS provisional permission as granted without exposing platform details', async () => {
    currentPermission = {
      granted: false,
      ios: { status: 3 },
      status: 'denied',
    };

    assert.deepEqual(await getNativeNotificationPermissionStatus(), {
      granted: true,
      status: 'denied',
    });
  });

  it('projects the requested native permission into the shared status shape', async () => {
    requestedPermission = { granted: false, status: 'undetermined' };

    assert.deepEqual(await requestNativeNotificationPermission(), {
      granted: false,
      status: 'undetermined',
    });
  });
});

describe('web notification permission fallback', () => {
  it('returns the shared denied status for both permission operations', async () => {
    assert.deepEqual(await getWebNotificationPermissionStatus(), { granted: false });
    assert.deepEqual(await requestWebNotificationPermission(), { granted: false });
  });
});
