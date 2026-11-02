import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { useWebPushPermission } from './webPushPermissionContext';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { NativePushProvider as NativePushProviderComponent } from './NativePushProvider';
import type { WebPushSupport } from './webPushPermissionContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationResponse =
  | { registerPushInstallation: { id: string } }
  | { updatePushInstallation: { completed: boolean } }
  | { unregisterPushInstallation: { completed: boolean } };

type MutationConfig = {
  variables: Record<string, unknown>;
  onCompleted: (response: MutationResponse, errors?: readonly unknown[]) => void;
  onError: (error: unknown) => void;
};

type Permission = NotificationPermission;

let session: { accountId: string | null; status: 'guest' | 'valid' } = {
  accountId: null,
  status: 'guest',
};
let permission: Permission = 'default';
let supportState: WebPushSupport = 'checking';
let webPushConfigAvailable = true;
let supportAvailable = true;
let updateFails = false;
let firebaseRegistrationFails = false;
let installationId: string | null = null;
let nextInstallationId = 'installation-1';
let registeredListener: ((fid: string) => void) | null = null;
let messageListener: ((payload: { data?: Record<string, string> }) => void) | null = null;
let renderer: ReactTestRenderer | null = null;
let permissionAction: (() => Promise<void>) | null = null;
let notificationPermissionRequestCalls = 0;
let navigatorStandalone: boolean | undefined;
const originalNotificationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Notification');
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const eventOrder: string[] = [];
const focusListeners = new Set<() => void>();
const visibilityListeners = new Set<() => void>();
let documentVisibilityState: DocumentVisibilityState = 'visible';
const serviceWorkerCalls: Array<{ scriptUrl: string; options: { scope: string } }> = [];
const registerCalls: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
const unregisterCalls: Record<string, unknown>[] = [];
const shownNotifications: Array<{ title: string; options: NotificationOptions }> = [];
const firebaseApps: Array<{ name: string; options: { appId: string } }> = [];
const serviceWorkerRegistration = {
  showNotification: async (title: string, options: NotificationOptions) => {
    shownNotifications.push({ title, options });
  },
};
const messaging = {};
const webPushConfig = {
  apiKey: 'api-key',
  appId: 'app-id',
  messagingSenderId: 'sender-id',
  projectId: 'project-id',
  vapidKey: 'vapid-key',
};

const commitRegister = (config: MutationConfig) => {
  registerCalls.push(config.variables);
  config.onCompleted({ registerPushInstallation: { id: nextInstallationId } });
};
const commitUpdate = (config: MutationConfig) => {
  updateCalls.push(config.variables);
  if (updateFails) {
    config.onError(new Error('installation unavailable'));
    return;
  }
  config.onCompleted({ updatePushInstallation: { completed: true } });
};
const commitUnregister = (config: MutationConfig) => {
  unregisterCalls.push(config.variables);
  config.onCompleted({ unregisterPushInstallation: { completed: true } });
};

mock.module('react-relay', {
  exports: {
    graphql: (strings: TemplateStringsArray) => strings.join(''),
    useMutation: (document: string) => [
      document.includes('mutation WebPushUnregisterInstallationMutation')
        ? commitUnregister
        : document.includes('mutation WebPushUpdateInstallationMutation')
          ? commitUpdate
          : commitRegister,
    ],
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/session/SessionProvider', {
  exports: { useSession: () => session },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/config/public', {
  exports: {
    getPublicConfig: (key: string) =>
      key === 'webPush' && webPushConfigAvailable ? webPushConfig : undefined,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./pushStorage', {
  exports: {
    deletePushInstallationId: async () => {
      installationId = null;
    },
    readPushInstallationId: async () => installationId,
    writePushInstallationId: async (id: string) => {
      installationId = id;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('firebase/app', {
  exports: {
    getApps: () => firebaseApps,
    initializeApp: (options: { appId: string }, name: string) => {
      const app = { name, options };
      firebaseApps.push(app);
      return app;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('firebase/messaging', {
  exports: {
    getMessaging: () => messaging,
    isSupported: async () => supportAvailable,
    onMessage: (_messaging: unknown, listener: typeof messageListener) => {
      eventOrder.push('onMessage');
      messageListener = listener;
      return () => {
        if (messageListener === listener) {
          messageListener = null;
        }
      };
    },
    onRegistered: (_messaging: unknown, listener: (fid: string) => void) => {
      eventOrder.push('onRegistered');
      registeredListener = listener;
      return () => {
        if (registeredListener === listener) {
          registeredListener = null;
        }
      };
    },
    register: async (_messaging: unknown, options: Record<string, unknown>) => {
      eventOrder.push('register');
      if (firebaseRegistrationFails) {
        throw new Error('Firebase registration failed');
      }
      registerOptions = options;
    },
    unregister: async () => {
      eventOrder.push('unregister');
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let registerOptions: Record<string, unknown> | null = null;
let NativePushProvider: typeof NativePushProviderComponent;

before(async () => {
  ({ NativePushProvider } = await import('./NativePushProvider'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }

  session = { accountId: null, status: 'guest' };
  permission = 'default';
  supportState = 'checking';
  webPushConfigAvailable = true;
  supportAvailable = true;
  updateFails = false;
  firebaseRegistrationFails = false;
  installationId = null;
  nextInstallationId = 'installation-1';
  registeredListener = null;
  messageListener = null;
  permissionAction = null;
  notificationPermissionRequestCalls = 0;
  navigatorStandalone = undefined;
  eventOrder.length = 0;
  serviceWorkerCalls.length = 0;
  registerCalls.length = 0;
  updateCalls.length = 0;
  unregisterCalls.length = 0;
  shownNotifications.length = 0;
  firebaseApps.length = 0;
  registerOptions = null;
  restoreBrowserGlobals();
  focusListeners.clear();
  visibilityListeners.clear();
  documentVisibilityState = 'visible';
});

describe('Web Push provider', () => {
  it('does not prompt guests or register while browser permission is undecided', async () => {
    exposeBrowserGlobals();
    await mountProvider();

    assert.equal(eventOrder.length, 0);
    assert.equal(serviceWorkerCalls.length, 0);
    assert.equal(registerCalls.length, 0);
    assert.equal(notificationPermissionRequestCalls, 0);

    session = { accountId: 'account-1', status: 'valid' };
    await updateProvider();

    assert.equal(eventOrder.includes('register'), false);
    assert.equal(eventOrder.includes('onRegistered'), true);
    assert.equal(serviceWorkerCalls.length, 1);
    assert.equal(registerCalls.length, 0);
  });

  it('starts registration only after the settings permission result is granted', async () => {
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider(createElement(PermissionActionCapture));
    assert.equal(eventOrder.includes('register'), false);

    await act(async () => {
      permission = 'granted';
      const request = permissionAction?.();
      assert.equal(notificationPermissionRequestCalls, 1);
      await request;
      await flushMicrotasks();
    });

    assert.equal(eventOrder.includes('register'), true);
  });

  it('retries Firebase registration when permission stays granted', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider(createElement(PermissionActionCapture));

    const initialRegisterCount = eventOrder.filter((event) => event === 'register').length;
    await act(async () => {
      if (permissionAction) {
        await permissionAction();
      }
      await flushMicrotasks();
    });

    assert.equal(
      eventOrder.filter((event) => event === 'register').length,
      initialRegisterCount + 1,
    );
  });

  it('rejects and retries when Firebase registration fails after a permission result', async () => {
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider(createElement(PermissionActionCapture));
    firebaseRegistrationFails = true;
    permission = 'granted';

    const requestPermission = permissionAction;
    assert.ok(requestPermission);
    await act(async () => {
      await assert.rejects(requestPermission(), /Firebase registration failed/);
    });
    assert.equal(eventOrder.filter((event) => event === 'register').length, 1);

    firebaseRegistrationFails = false;
    await act(async () => requestPermission());
    assert.equal(eventOrder.filter((event) => event === 'register').length, 2);
  });

  it('registers after attaching the FID observer and stores the server-issued row ID', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider();

    assert.ok(eventOrder.indexOf('onRegistered') < eventOrder.indexOf('register'));
    assert.deepEqual(registerOptions, {
      serviceWorkerRegistration,
      vapidKey: 'vapid-key',
    });
    assert.equal(serviceWorkerCalls[0]?.options.scope, '/');
    assert.deepEqual(
      new URL(serviceWorkerCalls[0]!.scriptUrl).searchParams.get('firebase'),
      JSON.stringify({
        apiKey: 'api-key',
        appId: 'app-id',
        messagingSenderId: 'sender-id',
        projectId: 'project-id',
      }),
    );

    await act(async () => {
      registeredListener?.('fid-1');
      await flushMicrotasks();
    });

    assert.deepEqual(registerCalls, [{ platform: 'WEB', token: 'fid-1' }]);
    assert.equal(installationId, 'installation-1');
  });

  it('updates the existing server row when Firebase reports a refreshed FID', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    installationId = 'installation-existing';
    exposeBrowserGlobals();
    await mountProvider();

    await act(async () => {
      registeredListener?.('fid-2');
      await flushMicrotasks();
    });

    assert.deepEqual(updateCalls, [
      { id: 'installation-existing', platform: 'WEB', token: 'fid-2' },
    ]);
    assert.deepEqual(registerCalls, []);
  });

  it('falls back to a new server row if the stored ID is no longer available', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    installationId = 'installation-deleted';
    updateFails = true;
    exposeBrowserGlobals();
    await mountProvider();

    await act(async () => {
      registeredListener?.('fid-3');
      await flushMicrotasks();
    });

    assert.deepEqual(updateCalls, [
      { id: 'installation-deleted', platform: 'WEB', token: 'fid-3' },
    ]);
    assert.deepEqual(registerCalls, [{ platform: 'WEB', token: 'fid-3' }]);
    assert.equal(installationId, 'installation-1');
  });

  it('shows one foreground notification with only route data', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider();

    await act(async () => {
      messageListener?.({
        data: {
          body: 'New reply',
          href: '/@author/post-1',
          notificationId: 'notification-1',
          recipientProfileId: 'profile-1',
          title: 'Reply',
        },
      });
      await flushMicrotasks();
    });

    assert.deepEqual(shownNotifications, [
      {
        title: 'Reply',
        options: {
          body: 'New reply',
          data: {
            href: '/@author/post-1',
            notificationId: 'notification-1',
            recipientProfileId: 'profile-1',
          },
          tag: 'notification-1',
        },
      },
    ]);
  });

  it('removes the backend row and Firebase registration when permission is denied', async () => {
    permission = 'denied';
    session = { accountId: 'account-1', status: 'valid' };
    installationId = 'installation-denied';
    exposeBrowserGlobals();
    await mountProvider();

    assert.deepEqual(unregisterCalls, [{ id: 'installation-denied' }]);
    assert.equal(eventOrder.includes('unregister'), true);
    assert.equal(installationId, null);
  });

  it('resynchronizes a granted permission when the browser returns to the app', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider();
    const initialRegisterCount = eventOrder.filter((event) => event === 'register').length;

    permission = 'denied';
    documentVisibilityState = 'hidden';
    await act(async () => {
      for (const listener of visibilityListeners) {
        listener();
      }
      await flushMicrotasks();
    });
    assert.equal(eventOrder.filter((event) => event === 'unregister').length, 0);

    permission = 'granted';
    documentVisibilityState = 'visible';
    await act(async () => {
      for (const listener of visibilityListeners) {
        listener();
      }
      for (const listener of focusListeners) {
        listener();
      }
      await flushMicrotasks();
    });

    assert.equal(
      eventOrder.filter((event) => event === 'register').length,
      initialRegisterCount + 2,
    );
    assert.equal(unregisterCalls.length, 0);
  });

  it('revokes a stored installation when browser focus observes denied permission', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    installationId = 'installation-existing';
    exposeBrowserGlobals();
    await mountProvider();

    permission = 'denied';
    await act(async () => {
      for (const listener of focusListeners) {
        listener();
      }
      await flushMicrotasks();
    });

    assert.deepEqual(unregisterCalls, [{ id: 'installation-existing' }]);
    assert.equal(eventOrder.includes('unregister'), true);
    assert.equal(installationId, null);
  });

  it('reports Firebase unsupported status and does not create a service worker', async () => {
    session = { accountId: 'account-1', status: 'valid' };
    supportAvailable = false;
    exposeBrowserGlobals();
    await mountProvider(createElement(PermissionActionCapture));

    assert.equal(supportState, 'unsupported');
    assert.equal(serviceWorkerCalls.length, 0);
    assert.equal(eventOrder.includes('register'), false);
  });

  it('requires a Home Screen app only when Firebase is unsupported and standalone is false', async () => {
    session = { accountId: 'account-1', status: 'valid' };
    supportAvailable = false;
    navigatorStandalone = false;
    exposeBrowserGlobals();
    await mountProvider(createElement(PermissionActionCapture));

    assert.equal(supportState, 'installation-required');
    assert.equal(notificationPermissionRequestCalls, 0);
    assert.equal(serviceWorkerCalls.length, 0);
  });

  it('keeps Firebase unsupported status for an installed app', async () => {
    session = { accountId: 'account-1', status: 'valid' };
    supportAvailable = false;
    navigatorStandalone = true;
    exposeBrowserGlobals();
    await mountProvider(createElement(PermissionActionCapture));

    assert.equal(supportState, 'unsupported');
    assert.equal(notificationPermissionRequestCalls, 0);
  });

  it('cleans browser and Firebase listeners when the provider unmounts', async () => {
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider();
    assert.equal(focusListeners.size, 1);
    assert.equal(visibilityListeners.size, 1);
    assert.ok(messageListener);
    assert.ok(registeredListener);

    const initialRegisterCount = eventOrder.filter((event) => event === 'register').length;
    await act(async () => {
      renderer?.unmount();
      renderer = null;
    });

    assert.equal(focusListeners.size, 0);
    assert.equal(visibilityListeners.size, 0);
    assert.equal(messageListener, null);
    assert.equal(registeredListener, null);
    assert.equal(eventOrder.filter((event) => event === 'register').length, initialRegisterCount);
  });

  it('does not start Firebase when Web Push config is absent', async () => {
    webPushConfigAvailable = false;
    permission = 'granted';
    session = { accountId: 'account-1', status: 'valid' };
    exposeBrowserGlobals();
    await mountProvider();

    assert.equal(eventOrder.length, 0);
    assert.equal(serviceWorkerCalls.length, 0);
  });
});

function exposeBrowserGlobals() {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: {
      get permission() {
        return permission;
      },
      requestPermission: async () => {
        notificationPermissionRequestCalls += 1;
        return permission;
      },
    } as unknown as typeof Notification,
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL('https://kos.moe/settings'),
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      standalone: navigatorStandalone,
      serviceWorker: {
        register: async (scriptUrl: string, options: { scope: string }) => {
          serviceWorkerCalls.push({ scriptUrl, options });
          return serviceWorkerRegistration;
        },
      },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (_type: string, listener: () => void) => focusListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => focusListeners.delete(listener),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener: (_type: string, listener: () => void) => visibilityListeners.add(listener),
      get visibilityState() {
        return documentVisibilityState;
      },
      removeEventListener: (_type: string, listener: () => void) =>
        visibilityListeners.delete(listener),
    },
  });
}

function restoreBrowserGlobals() {
  for (const [key, descriptor] of [
    ['Notification', originalNotificationDescriptor],
    ['location', originalLocationDescriptor],
    ['navigator', originalNavigatorDescriptor],
    ['window', originalWindowDescriptor],
    ['document', originalDocumentDescriptor],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
}

async function mountProvider(children?: ReactNode) {
  await act(async () => {
    renderer = create(createElement(NativePushProvider, null, children));
    await flushMicrotasks();
  });
}

async function updateProvider(children?: ReactNode) {
  assert.ok(renderer);
  await act(async () => {
    renderer?.update(createElement(NativePushProvider, null, children));
    await flushMicrotasks();
  });
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
}

function PermissionActionCapture() {
  const value = useWebPushPermission();
  permissionAction = value.requestPermission;
  supportState = value.support;
  return null;
}
