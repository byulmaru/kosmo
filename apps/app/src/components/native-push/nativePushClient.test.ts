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
const nativeModules: {
  KosmoPushPresentation: { presentationVersion?: unknown };
} = {
  // React Native exposes values returned by the native module's synchronous
  // getConstants() implementation as module properties.
  KosmoPushPresentation: { presentationVersion: 1 },
};
const categoryRegistrations: Array<{ actions: unknown[]; identifier: string }> = [];

mock.module('react-native', {
  exports: { NativeModules: nativeModules, Platform: { OS: 'ios' } },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('@react-native-firebase/messaging', {
  exports: { getMessaging: () => ({}) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-notifications', {
  exports: {
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    getPermissionsAsync: () => Promise.resolve(currentPermission),
    requestPermissionsAsync: () => Promise.resolve(requestedPermission),
    setNotificationCategoryAsync: (identifier: string, actions: unknown[]) => {
      categoryRegistrations.push({ actions, identifier });
      return Promise.reject(new Error('category unavailable in test bridge'));
    },
    setNotificationHandler: () => undefined,
  },
} as unknown as Parameters<typeof mock.module>[1]);

let getNativeNotificationPermissionStatus: typeof NativePushClientNativeModule.getNativeNotificationPermissionStatus;
let requestNativeNotificationPermission: typeof NativePushClientNativeModule.requestNativeNotificationPermission;
let getNativePushPresentationVersion: typeof NativePushClientNativeModule.getNativePushPresentationVersion;
let getWebNotificationPermissionStatus: typeof NativePushClientWebModule.getNativeNotificationPermissionStatus;
let requestWebNotificationPermission: typeof NativePushClientWebModule.requestNativeNotificationPermission;

before(async () => {
  ({ getNativeNotificationPermissionStatus, requestNativeNotificationPermission } =
    await import('./nativePushClient.native'));
  ({ getNativePushPresentationVersion } = await import('./nativePushClient.native'));
  ({
    getNativeNotificationPermissionStatus: getWebNotificationPermissionStatus,
    requestNativeNotificationPermission: requestWebNotificationPermission,
  } = await import('./nativePushClient'));
});

describe('native notification permission adapter', () => {
  it('registers the iOS presentation category without blocking permission access when it fails', async () => {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(categoryRegistrations, [
      { actions: [], identifier: 'KOSMO_PUSH_PRESENTATION_V1' },
    ]);
    assert.deepEqual(await getNativeNotificationPermissionStatus(), {
      granted: false,
      status: 'undetermined',
    });
  });

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

describe('native push presentation capability adapter', () => {
  it('reads the synchronous native constant and reports only the exact capability version', () => {
    assert.equal('getPresentationVersion' in nativeModules.KosmoPushPresentation, false);

    nativeModules.KosmoPushPresentation.presentationVersion = 1;
    assert.equal(getNativePushPresentationVersion(), 1);

    nativeModules.KosmoPushPresentation.presentationVersion = 0;
    assert.equal(getNativePushPresentationVersion(), 0);

    nativeModules.KosmoPushPresentation.presentationVersion = 2;
    assert.equal(getNativePushPresentationVersion(), 0);

    nativeModules.KosmoPushPresentation.presentationVersion = undefined as never;
    assert.equal(getNativePushPresentationVersion(), 0);
  });
});

describe('web notification permission fallback', () => {
  it('returns the shared denied status for both permission operations', async () => {
    assert.deepEqual(await getWebNotificationPermissionStatus(), { granted: false });
    assert.deepEqual(await requestWebNotificationPermission(), { granted: false });
  });
});
