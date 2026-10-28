import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SessionStatus = 'error' | 'guest' | 'valid';
type Session = {
  accountId: string | null;
  selectedProfileId: string | null;
  status: SessionStatus;
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

let platform: 'ios' | 'web' = 'web';
let params: Record<string, string | string[] | undefined> = {};
let session: Session = { accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' };
let setRoutePath: ((path: string) => void) | null = null;
let rejectProfileWrite = false;
let renderer: ReactTestRenderer | null = null;
let PushRoute: ComponentType;
const operations: string[] = [];
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

const replace = mock.fn((path: string) => {
  operations.push(`router:${path}`);
  setRoutePath?.(path);
});
const resetActor = mock.fn((profileId: string) => {
  operations.push(`reset:${profileId}`);
});
const writeSelectedProfile = mock.fn(async (profileId: string) => {
  operations.push(`write:${profileId}`);
  if (rejectProfileWrite) {
    throw new Error('profile storage unavailable');
  }
});
const openURL = mock.fn(async (href: string) => {
  operations.push(`linking:${href}`);
});
const browserReplace = mock.fn((href: string) => {
  operations.push(`browser:${href}`);
  setRoutePath?.(href);
});

mockModule('expo-router', {
  useLocalSearchParams: () => params,
  useRouter: () => ({ replace }),
});
mockModule('react-native', {
  Linking: { openURL },
  Platform: {
    get OS() {
      return platform;
    },
  },
});
mockModule('@/auth/selectedProfileStorage', { writeSelectedProfile });
mockModule('@/relay/RelayActorProvider', { useRelayActor: () => ({ resetActor }) });
mockModule('@/session/SessionProvider', { useSession: () => session });

before(async () => {
  ({ default: PushRoute } = await import('../../app/push'));
});

afterEach(async () => {
  platform = 'web';
  params = {};
  session = { accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' };
  setRoutePath = null;
  rejectProfileWrite = false;
  operations.length = 0;
  replace.mock.resetCalls();
  resetActor.mock.resetCalls();
  writeSelectedProfile.mock.resetCalls();
  openURL.mock.resetCalls();
  browserReplace.mock.resetCalls();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('Web push action route', () => {
  it('opens a valid target without switching the already-selected Profile', async () => {
    params = profileParams();
    await renderRoute();

    assert.deepEqual(operations, ['router:/@alice/post-42']);
    assert.equal(routedPath(), '/@alice/post-42');
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('persists and resets the recipient Profile before opening its target', async () => {
    params = profileParams({ recipientProfileId: 'profile-b' });
    await renderRoute();

    assert.deepEqual(operations, ['write:profile-b', 'reset:profile-b', 'router:/@alice/post-42']);
    assert.equal(routedPath(), '/@alice/post-42');
  });

  it('falls back to Notifications if persisting the recipient Profile fails', async () => {
    rejectProfileWrite = true;
    params = profileParams({ recipientProfileId: 'profile-b' });
    await renderRoute();

    assert.deepEqual(operations, ['write:profile-b', 'router:/notifications']);
    assert.equal(routedPath(), '/notifications');
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('sends malformed or duplicated query values to Notifications', async () => {
    params = { ...profileParams(), notificationId: ['notification-a', 'notification-b'] };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('rejects an Operational target for another Account without switching Profiles', async () => {
    params = {
      href: '/notifications',
      notificationId: 'notification-a',
      recipientAccountId: 'account-b',
    };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
    assert.equal(openURL.mock.callCount(), 0);
  });

  it('opens a matching Operational internal target without switching Profiles', async () => {
    params = {
      href: '/notifications?filter=unread',
      notificationId: 'notification-a',
      recipientAccountId: 'account-a',
    };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications?filter=unread']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('replaces the action URL with a validated external destination in the same browser tab', async () => {
    params = {
      href: 'https://example.com/notices/42',
      notificationId: 'notification-a',
      recipientAccountId: 'account-a',
    };
    await renderRoute();

    assert.deepEqual(operations, ['browser:https://example.com/notices/42']);
    assert.equal(openURL.mock.callCount(), 0);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });

  it('does not navigate to an unsafe external URL', async () => {
    params = {
      href: 'javascript:alert(1)',
      notificationId: 'notification-a',
      recipientAccountId: 'account-a',
    };
    await renderRoute();

    assert.deepEqual(operations, ['router:/notifications']);
    assert.equal(browserReplace.mock.callCount(), 0);
    assert.equal(openURL.mock.callCount(), 0);
  });

  it('discards the target for guests and does not replay it after login', async () => {
    params = profileParams({ recipientProfileId: 'profile-b' });
    session = { accountId: null, selectedProfileId: null, status: 'guest' };
    await renderRoute();

    assert.deepEqual(operations, ['router:/']);
    assert.equal(routedPath(), '/');
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);

    await act(async () => {
      session = { accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' };
      renderer?.update(createElement(TestRouter));
      await Promise.resolve();
    });

    assert.deepEqual(operations, ['router:/']);
    assert.equal(routedPath(), '/');
  });

  it('routes session errors through the existing root error screen', async () => {
    params = profileParams({ recipientProfileId: 'profile-b' });
    session = { accountId: null, selectedProfileId: null, status: 'error' };
    await renderRoute();

    assert.deepEqual(operations, ['router:/']);
    assert.equal(writeSelectedProfile.mock.callCount(), 0);
    assert.equal(resetActor.mock.callCount(), 0);
  });
});

function TestRouter() {
  const [path, setPath] = useState('/push');
  setRoutePath = setPath;
  return path === '/push' ? createElement(PushRoute) : createElement(RouteOutput, { path });
}

function RouteOutput({ path }: { path: string }) {
  return createElement('div', { path });
}

function routedPath(): string {
  assert.ok(renderer);
  return renderer.root.findByType(RouteOutput).props.path;
}

async function renderRoute() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { replace: browserReplace } },
  });
  await act(async () => {
    renderer = create(createElement(TestRouter));
    await Promise.resolve();
  });
  assert.ok(renderer);
}

function profileParams(overrides: Partial<Record<string, string | string[]>> = {}) {
  return {
    href: '/@alice/post-42',
    notificationId: 'notification-a',
    recipientProfileId: 'profile-a',
    ...overrides,
  };
}
