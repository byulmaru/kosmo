import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { WebPushPermissionContext } from '@/components/native-push/webPushPermissionContext';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { WebPushSupport } from '@/components/native-push/webPushPermissionContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type BannerProps = {
  onDismiss: () => void;
  onEnable: () => void;
  pending: boolean;
};

function MockBanner(props: BannerProps) {
  return createElement('NotificationPermissionBanner', props);
}

mock.module('@/components/ui/NotificationPermissionBanner', {
  exports: { NotificationPermissionBanner: MockBanner },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: { View: 'View' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/ui/ToastProvider', {
  exports: { useToast: () => ({ showToast }) },
} as unknown as Parameters<typeof mock.module>[1]);

let HomePushPermissionBanner: ComponentType;
let renderer: ReactTestRenderer | null = null;
let promptCalls = 0;
let throwPromptSynchronously = false;
let promptResult: () => Promise<NotificationPermission> = () => Promise.resolve('default');
let support: WebPushSupport = 'supported';
let initialPermission: NotificationPermission = 'default';
let failStorageRead = false;
let failStorageWrite = false;
const storedValues = new Map<string, string>();
const toasts: Array<{ message: string; tone: string }> = [];
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function showToast(message: string, options: { tone: string }) {
  toasts.push({ message, tone: options.tone });
}

const storage = {
  getItem(key: string) {
    if (failStorageRead) {
      throw new Error('storage unavailable');
    }
    return storedValues.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    if (failStorageWrite) {
      throw new Error('storage unavailable');
    }
    storedValues.set(key, value);
  },
};

function PermissionHarness() {
  const [permission, setPermission] = useState(initialPermission);
  const requestPermission = () => {
    promptCalls += 1;
    if (throwPromptSynchronously) {
      throw new Error('permission request failed');
    }
    return promptResult().then((nextPermission) => setPermission(nextPermission));
  };

  return createElement(
    WebPushPermissionContext.Provider,
    {
      value: { permission, requestPermission, support },
    },
    createElement(HomePushPermissionBanner),
  );
}

async function mount() {
  await act(async () => {
    renderer = create(createElement(PermissionHarness));
  });
}

function banner() {
  return renderer?.root.findAllByType(MockBanner)[0];
}

function exposeBrowserStorage() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
}

async function unmount() {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
}

before(async () => {
  ({ HomePushPermissionBanner } = await import('./HomePushPermissionBanner'));
});

afterEach(async () => {
  await unmount();
  promptCalls = 0;
  throwPromptSynchronously = false;
  promptResult = () => Promise.resolve('default');
  support = 'supported';
  initialPermission = 'default';
  failStorageRead = false;
  failStorageWrite = false;
  storedValues.clear();
  toasts.length = 0;
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('Home Web Push permission banner', () => {
  it('shows only for a supported browser with undecided permission and does not prompt on render', async () => {
    exposeBrowserStorage();
    await mount();

    assert.ok(banner());
    assert.equal(promptCalls, 0);

    for (const nextSupport of [
      'checking',
      'installation-required',
      'unsupported',
      'unavailable',
    ] as const) {
      await unmount();
      support = nextSupport;
      await mount();
      assert.equal(banner(), undefined);
    }

    await unmount();
    support = 'supported';
    initialPermission = 'granted';
    await mount();
    assert.equal(banner(), undefined);

    await unmount();
    initialPermission = 'denied';
    await mount();
    assert.equal(banner(), undefined);
    assert.equal(promptCalls, 0);
  });

  it('requests on click once, shows pending state, then hides after the permission is granted', async () => {
    exposeBrowserStorage();
    let resolvePrompt!: (permission: NotificationPermission) => void;
    promptResult = () =>
      new Promise((resolve) => {
        resolvePrompt = resolve;
      });
    await mount();

    const onEnable = banner()?.props.onEnable as () => void;
    await act(async () => onEnable());
    assert.equal(promptCalls, 1);
    assert.equal(banner()?.props.pending, true);

    await act(async () => resolvePrompt('granted'));
    assert.equal(banner(), undefined);
    assert.deepEqual(toasts, []);
  });

  it('hides after denial and keeps a dismissed banner hidden after remount', async () => {
    exposeBrowserStorage();
    promptResult = () => Promise.resolve('denied');
    await mount();

    await act(async () => banner()?.props.onEnable());
    assert.equal(promptCalls, 1);
    assert.equal(banner(), undefined);

    await unmount();
    initialPermission = 'default';
    await mount();
    await act(async () => banner()?.props.onDismiss());
    assert.equal(banner(), undefined);
    assert.equal(storedValues.size, 1);

    await unmount();
    await mount();
    assert.equal(banner(), undefined);
  });

  it('keeps the banner visible and retryable when the permission prompt returns default', async () => {
    exposeBrowserStorage();
    promptResult = () => Promise.resolve('default');
    await mount();

    await act(async () => banner()?.props.onEnable());
    assert.equal(promptCalls, 1);
    assert.ok(banner());
    assert.equal(banner()?.props.pending, false);

    await act(async () => banner()?.props.onEnable());
    assert.equal(promptCalls, 2);
    assert.ok(banner());
  });

  it('reports a synchronous permission request error and allows retry', async () => {
    exposeBrowserStorage();
    throwPromptSynchronously = true;
    await mount();

    await act(async () => banner()?.props.onEnable());
    assert.equal(promptCalls, 1);
    assert.ok(banner());
    assert.equal(banner()?.props.pending, false);
    assert.deepEqual(toasts, [
      {
        message: '브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.',
        tone: 'danger',
      },
    ]);

    throwPromptSynchronously = false;
    await act(async () => banner()?.props.onEnable());
    assert.equal(promptCalls, 2);
    assert.ok(banner());
  });

  it('reports request failures and allows retry, while storage failure only dismisses this mount', async () => {
    exposeBrowserStorage();
    let rejectPrompt = true;
    promptResult = () =>
      rejectPrompt
        ? Promise.reject(new Error('permission request failed'))
        : Promise.resolve('default');
    await mount();

    await act(async () => {
      banner()?.props.onEnable();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(promptCalls, 1);
    assert.ok(banner());
    assert.deepEqual(toasts, [
      {
        message: '브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.',
        tone: 'danger',
      },
    ]);

    rejectPrompt = false;
    await act(async () => banner()?.props.onEnable());
    assert.equal(promptCalls, 2);
    assert.ok(banner());

    failStorageWrite = true;
    await act(async () => banner()?.props.onDismiss());
    assert.equal(banner(), undefined);
    await unmount();

    failStorageRead = true;
    await mount();
    assert.ok(banner());
  });

  it('renders no Web context requirement in Native', async () => {
    const { HomePushPermissionBanner: NativeBanner } =
      await import('./HomePushPermissionBanner.native');
    await act(async () => {
      renderer = create(createElement(NativeBanner));
    });

    assert.equal(renderer?.toJSON(), null);
  });
});
