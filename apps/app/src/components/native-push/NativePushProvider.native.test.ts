import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { NativePushProvider as NativePushProviderComponent } from './NativePushProvider.native';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Permission = {
  granted: boolean;
  status: 'undetermined' | 'denied' | 'granted';
};

type MutationConfig = {
  variables: Record<string, unknown>;
  onCompleted: (response: object, errors?: readonly unknown[]) => void;
  onError: (error: unknown) => void;
};

let session = { status: 'guest' };
let permission: Permission = { granted: false, status: 'undetermined' };
let requestedPermission: Permission = { granted: true, status: 'granted' };
let nextPermissionRead: Promise<Permission> | null = null;
let storedInstallationId: string | null = null;
let appStateListener: ((state: string) => void) | null = null;
let tokenRefreshListener: ((token: string) => void) | null = null;
let renderer: ReactTestRenderer | null = null;
const registerCalls: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
const unregisterCalls: Record<string, unknown>[] = [];

const getPermission = mock.fn((): Promise<Permission> => {
  const next = nextPermissionRead ?? Promise.resolve(permission);
  nextPermissionRead = null;
  return next;
});
const requestPermission = mock.fn(async () => {
  permission = requestedPermission;
  return requestedPermission;
});
const getToken = mock.fn(async () => 'initial-token');
const subscribeToTokenRefresh = mock.fn((listener: (token: string) => void) => {
  tokenRefreshListener = listener;
  return () => {
    if (tokenRefreshListener === listener) {
      tokenRefreshListener = null;
    }
  };
});
const addAppStateListener = mock.fn((_event: string, listener: (state: string) => void) => {
  appStateListener = listener;
  return {
    remove: () => {
      if (appStateListener === listener) {
        appStateListener = null;
      }
    },
  };
});

const commitRegister = mock.fn((config: MutationConfig) => {
  registerCalls.push(config.variables);
  config.onCompleted({ registerPushInstallation: { id: 'installation-1' } });
});
const commitUpdate = mock.fn((config: MutationConfig) => {
  updateCalls.push(config.variables);
  config.onCompleted({ updatePushInstallation: { completed: true } });
});
const commitUnregister = mock.fn((config: MutationConfig) => {
  unregisterCalls.push(config.variables);
  config.onCompleted({ unregisterPushInstallation: { completed: true } });
});

mock.module('react-native', {
  exports: {
    AppState: { addEventListener: addAppStateListener },
    Platform: { OS: 'ios' },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  exports: {
    graphql: (strings: TemplateStringsArray) => strings.join(''),
    useMutation: (document: string) => [
      document.includes('mutation NativePushUnregisterInstallationMutation')
        ? commitUnregister
        : document.includes('mutation NativePushUpdateInstallationMutation')
          ? commitUpdate
          : commitRegister,
    ],
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/session/SessionProvider', {
  exports: { useSession: () => session },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./nativePushClient', {
  exports: {
    getNativeFcmToken: getToken,
    getNativeNotificationPermissionStatus: getPermission,
    requestNativeNotificationPermission: requestPermission,
    subscribeToNativeFcmTokenRefresh: subscribeToTokenRefresh,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./pushStorage', {
  exports: {
    deletePushInstallationId: async () => {
      storedInstallationId = null;
    },
    readPushInstallationId: async () => storedInstallationId,
    writePushInstallationId: async (installationId: string) => {
      storedInstallationId = installationId;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./useNativePushNotificationResponses.native', {
  exports: { useNativePushNotificationResponses: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);

let NativePushProvider: typeof NativePushProviderComponent;

before(async () => {
  ({ NativePushProvider } = await import('./NativePushProvider.native'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }

  session = { status: 'guest' };
  permission = { granted: false, status: 'undetermined' };
  requestedPermission = { granted: true, status: 'granted' };
  nextPermissionRead = null;
  storedInstallationId = null;
  appStateListener = null;
  tokenRefreshListener = null;
  registerCalls.length = 0;
  updateCalls.length = 0;
  unregisterCalls.length = 0;
  getPermission.mock.resetCalls();
  requestPermission.mock.resetCalls();
  getToken.mock.resetCalls();
  subscribeToTokenRefresh.mock.resetCalls();
  addAppStateListener.mock.resetCalls();
  commitRegister.mock.resetCalls();
  commitUpdate.mock.resetCalls();
  commitUnregister.mock.resetCalls();
});

describe('native push provider permission startup', () => {
  it('requests permission after the session becomes valid and syncs a granted token', async () => {
    await mountProvider();
    assert.equal(requestPermission.mock.callCount(), 0);

    session = { status: 'valid' };
    await updateProvider();

    assert.equal(requestPermission.mock.callCount(), 1);
    assert.equal(getToken.mock.callCount(), 1);
    assert.deepEqual(registerCalls, [{ platform: 'IOS', token: 'initial-token' }]);
    assert.equal(storedInstallationId, 'installation-1');
  });

  it('does not prompt again from AppState or token refresh while permission stays undetermined', async () => {
    session = { status: 'valid' };
    requestedPermission = { granted: false, status: 'undetermined' };
    await mountProvider();

    await act(async () => {
      appStateListener?.('active');
      tokenRefreshListener?.('refreshed-token');
      await flushMicrotasks();
    });

    assert.equal(requestPermission.mock.callCount(), 1);
    assert.equal(getToken.mock.callCount(), 0);
    assert.equal(registerCalls.length, 0);
  });

  it('keeps startup, foreground, and token refresh synchronization for granted permission', async () => {
    session = { status: 'valid' };
    permission = { granted: true, status: 'granted' };
    await mountProvider();

    await act(async () => {
      appStateListener?.('active');
      tokenRefreshListener?.('refreshed-token');
      await flushMicrotasks();
    });

    assert.equal(requestPermission.mock.callCount(), 0);
    assert.equal(getToken.mock.callCount(), 2);
    assert.deepEqual(registerCalls, [{ platform: 'IOS', token: 'initial-token' }]);
    assert.deepEqual(updateCalls.map(({ token }) => token).sort(), [
      'initial-token',
      'refreshed-token',
    ]);
  });

  it('does not acquire or register a token when the automatic request is denied', async () => {
    session = { status: 'valid' };
    requestedPermission = { granted: false, status: 'denied' };
    await mountProvider();

    assert.equal(requestPermission.mock.callCount(), 1);
    assert.equal(getToken.mock.callCount(), 0);
    assert.equal(registerCalls.length, 0);
  });

  it('cleans up an existing installation for an already denied permission without prompting', async () => {
    session = { status: 'valid' };
    permission = { granted: false, status: 'denied' };
    storedInstallationId = 'installation-existing';
    await mountProvider();

    assert.equal(requestPermission.mock.callCount(), 0);
    assert.equal(getToken.mock.callCount(), 0);
    assert.deepEqual(unregisterCalls, [{ id: 'installation-existing' }]);
    assert.equal(storedInstallationId, null);
  });

  it('does not prompt or register if the session expires before the permission result', async () => {
    session = { status: 'valid' };
    let resolvePermission!: (result: Permission) => void;
    nextPermissionRead = new Promise((resolve) => {
      resolvePermission = resolve;
    });
    await mountProvider();
    assert.equal(getPermission.mock.callCount(), 1);

    session = { status: 'guest' };
    await updateProvider();
    await act(async () => {
      resolvePermission({ granted: false, status: 'undetermined' });
      await flushMicrotasks();
    });

    assert.equal(requestPermission.mock.callCount(), 0);
    assert.equal(getToken.mock.callCount(), 0);
    assert.equal(registerCalls.length, 0);

    session = { status: 'valid' };
    await updateProvider();

    assert.equal(requestPermission.mock.callCount(), 1);
    assert.equal(getToken.mock.callCount(), 1);
    assert.equal(registerCalls.length, 1);
  });
});

async function mountProvider() {
  await act(async () => {
    renderer = create(createElement(NativePushProvider));
    await flushMicrotasks();
  });
}

async function updateProvider() {
  assert.ok(renderer);
  await act(async () => {
    renderer?.update(createElement(NativePushProvider));
    await flushMicrotasks();
  });
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
}
