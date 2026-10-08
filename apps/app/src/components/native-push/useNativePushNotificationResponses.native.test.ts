import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let session: { accountId: string; selectedProfileId: string | null; status: string } = {
  accountId: 'account-1',
  selectedProfileId: 'profile-1',
  status: 'valid',
};
let responseListener: ((response: unknown) => void) | null = null;
const profileSelectionCalls: string[] = [];
let writeProfile: (profileId: string) => Promise<void> = async () => undefined;
const router = {
  replace: mock.fn((href: string) => profileSelectionCalls.push(`navigate:${href}`)),
};
const defaultReplace = router.replace;
let rejectNextOpenURL = false;
const openURL = mock.fn(async () => {
  if (rejectNextOpenURL) {
    rejectNextOpenURL = false;
    throw new Error('External URL could not be opened.');
  }
});
const resetActor = mock.fn((profileId: string) => profileSelectionCalls.push(`reset:${profileId}`));
const commitMutation = mock.fn();
let renderer: ReactTestRenderer | null = null;
let clearResponseCount = 0;
let useNativePushNotificationResponses: () => void;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', { useRouter: () => router });
mockModule('react-native', {
  AppState: {
    addEventListener: () => ({ remove: () => undefined }),
  },
  Linking: { openURL },
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useMutation: () => [commitMutation],
});
mockModule('@/relay/RelayActorProvider', { useRelayActor: () => ({ resetActor }) });
mockModule('@/session/SessionProvider', { useSession: () => session });
mockModule('@/auth/selectedProfileStorage', {
  writeSelectedProfile: (profileId: string) => writeProfile(profileId),
});
mockModule('./nativePushClient', {
  clearLastNativeNotificationResponse: () => {
    clearResponseCount++;
    profileSelectionCalls.push('clear-response');
  },
  getLastNativeNotificationResponse: async () => null,
  subscribeToNativeNotificationResponses: (listener: (response: unknown) => void) => {
    responseListener = listener;
    return () => {
      responseListener = null;
    };
  },
});

before(async () => {
  ({ useNativePushNotificationResponses } =
    await import('./useNativePushNotificationResponses.native'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  session = { accountId: 'account-1', selectedProfileId: 'profile-1', status: 'valid' };
  responseListener = null;
  writeProfile = async () => undefined;
  profileSelectionCalls.length = 0;
  router.replace = defaultReplace;
  router.replace.mock.resetCalls();
  openURL.mock.resetCalls();
  rejectNextOpenURL = false;
  resetActor.mock.resetCalls();
  commitMutation.mock.resetCalls();
  clearResponseCount = 0;
  mock.restoreAll();
});

describe('native push responses', () => {
  it('opens any internal app route without selecting a Profile or marking the notification read', async () => {
    await renderHook();

    await handle({
      href: '/settings/info?source=notice',
      notificationId: 'operational-1',
      recipientAccountId: 'account-1',
    });

    assert.deepEqual(
      router.replace.mock.calls.map(({ arguments: args }) => args),
      [['/settings/info?source=notice']],
    );
    assert.equal(openURL.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(commitMutation.mock.callCount(), 0);
    assert.equal(clearResponseCount, 1);
  });

  it('opens external HTTPS destinations for the matching account without profile switching', async () => {
    await renderHook();

    await handle({
      href: 'https://external.example/notice',
      notificationId: 'operational-2',
      recipientAccountId: 'account-1',
    });

    assert.deepEqual(
      openURL.mock.calls.map(({ arguments: args }) => args),
      [['https://external.example/notice']],
    );
    assert.equal(router.replace.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(commitMutation.mock.callCount(), 0);
  });

  it('falls back to notifications when opening a matching external Account destination fails', async () => {
    await renderHook();
    rejectNextOpenURL = true;

    await handle({
      href: 'https://external.example/notice',
      notificationId: 'operational-open-failure',
      recipientAccountId: 'account-1',
    });

    assert.deepEqual(
      openURL.mock.calls.map(({ arguments: args }) => args),
      [['https://external.example/notice']],
    );
    assert.deepEqual(
      router.replace.mock.calls.map(({ arguments: args }) => args),
      [['/notifications']],
    );
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(commitMutation.mock.callCount(), 0);
  });

  it('opens Account notices for an active account without a selected Profile', async () => {
    session = { accountId: 'account-1', selectedProfileId: null, status: 'valid' };
    await renderHook();

    await handle({
      href: '/notifications?source=notice',
      notificationId: 'operational-profile-required',
      recipientAccountId: 'account-1',
    });

    assert.deepEqual(
      router.replace.mock.calls.map(({ arguments: args }) => args),
      [['/notifications?source=notice']],
    );
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(commitMutation.mock.callCount(), 0);
  });

  it('falls back to notifications when the push recipient account does not match', async () => {
    await renderHook();

    await handle({
      href: 'https://external.example/notice',
      notificationId: 'operational-3',
      recipientAccountId: 'account-2',
    });

    assert.deepEqual(
      router.replace.mock.calls.map(({ arguments: args }) => args),
      [['/notifications']],
    );
    assert.equal(openURL.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(commitMutation.mock.callCount(), 0);
  });

  it('persists and resets the recipient Profile before navigating to its destination', async () => {
    let resolveWriteStarted!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      resolveWriteStarted = resolve;
    });
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let resolveNavigation!: () => void;
    const navigation = new Promise<void>((resolve) => {
      resolveNavigation = resolve;
    });
    router.replace = mock.fn((href: string) => {
      profileSelectionCalls.push(`navigate:${href}`);
      resolveNavigation();
    });
    writeProfile = async (profileId) => {
      profileSelectionCalls.push(`persist:start:${profileId}`);
      resolveWriteStarted();
      await writeGate;
      profileSelectionCalls.push(`persist:done:${profileId}`);
    };
    await renderHook();

    const handling = handle({
      href: '/@recipient/postId',
      notificationId: 'notification-1',
      recipientProfileId: 'profile-recipient',
    });
    await writeStarted;
    assert.deepEqual(profileSelectionCalls, ['persist:start:profile-recipient']);

    releaseWrite();
    await navigation;
    await handling;

    assert.deepEqual(profileSelectionCalls, [
      'persist:start:profile-recipient',
      'persist:done:profile-recipient',
      'reset:profile-recipient',
      'clear-response',
      'navigate:/@recipient/postId',
    ]);
  });

  it('does not persist or reset when the notification recipient is already selected', async () => {
    session.selectedProfileId = 'profile-recipient';
    let resolveNavigation!: () => void;
    const navigation = new Promise<void>((resolve) => {
      resolveNavigation = resolve;
    });
    router.replace = mock.fn((href: string) => {
      profileSelectionCalls.push(`navigate:${href}`);
      resolveNavigation();
    });
    await renderHook();

    const handling = handle({
      href: '/@recipient/postId',
      notificationId: 'notification-1',
      recipientProfileId: 'profile-recipient',
    });
    await navigation;
    await handling;

    assert.deepEqual(profileSelectionCalls, [
      'clear-response',
      'navigate:/@recipient/postId',
    ]);
  });
});

async function renderHook() {
  await act(async () => {
    renderer = create(createElement(HookHarness));
  });
  assert.ok(renderer);
}

function HookHarness() {
  useNativePushNotificationResponses();
  return null;
}

async function handle(data: Record<string, unknown>) {
  assert.ok(responseListener);
  const listener = responseListener;
  await act(async () => {
    listener?.({
      actionIdentifier: 'default',
      notification: {
        request: { content: { data }, identifier: `push-${String(data.notificationId)}` },
      },
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}
