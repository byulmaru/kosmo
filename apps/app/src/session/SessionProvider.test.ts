import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let actorProfileId: string | null = null;
let persistedProfileId: string | null = null;
let pendingProfileRead: Promise<string | null> | null = null;
let serverSelectedProfileId: string | null = 'profile-server';
let authLifecycleKey = 'auth-1';
let actorLifecycleKey = 'actor-1';
let serverAccountId: string | null = 'account-1';
let serverAccountName: string | null = 'Account';
let serverSessionId: string | null = 'session-1';
const resetActorCalls: Array<string | null | undefined> = [];
const writes: Array<{ accountId: string; profileId: string; sessionId: string }> = [];
let latestSessionErrorReporter: ReactElement<{
  actorLifecycleKey: string;
  authLifecycleKey: string;
  onError: (authKey: string, actorKey: string) => void;
}> | null = null;
let renderer: ReactTestRenderer | null = null;
let SessionProvider: ComponentType<PropsWithChildren>;
let useSession: () => {
  accountId: string | null;
  accountName: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
  status: string;
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: platform });
mockModule('react-relay', {
  graphql: () => 'SessionProviderQuery',
  useLazyLoadQuery: () => ({
    currentSession: serverSessionId
      ? {
          id: serverSessionId,
          selectedProfile: serverSelectedProfileId ? { id: serverSelectedProfileId } : null,
        }
      : null,
    me: serverAccountId ? { id: serverAccountId, name: serverAccountName } : null,
  }),
});
mockModule('@/auth/selectedProfileStorage', {
  deleteSelectedProfile: async () => undefined,
  readSelectedProfile: () => pendingProfileRead ?? Promise.resolve(persistedProfileId),
  writeSelectedProfile: async (
    scope: { accountId: string; sessionId: string },
    profileId: string,
  ) => {
    writes.push({ ...scope, profileId });
  },
});
mockModule('@/components/RelayFailOpenBoundary', {
  RelayFailOpenBoundary: ({ children, fallback }: PropsWithChildren<{ fallback: ReactNode }>) => {
    latestSessionErrorReporter = fallback as typeof latestSessionErrorReporter;
    return children;
  },
});
mockModule('@/components/Splash', { Splash: () => null });
mockModule('@/relay/RelayActorProvider', {
  useRelayActor: () => ({
    clearNativeSession: async () => undefined,
    nativeToken: null,
    resetActor: (profileId?: string | null) => {
      resetActorCalls.push(profileId);
      actorProfileId = profileId ?? null;
    },
    selectedProfileId: actorProfileId,
  }),
  useRelayActorLifecycleKey: () => actorLifecycleKey,
  useRelayAuthLifecycleKey: () => authLifecycleKey,
});

before(async () => {
  ({ SessionProvider, useSession } = await import('./SessionProvider'));
});

beforeEach(() => {
  actorProfileId = null;
  persistedProfileId = null;
  pendingProfileRead = null;
  serverSelectedProfileId = 'profile-server';
  authLifecycleKey = 'auth-1';
  actorLifecycleKey = 'actor-1';
  serverAccountId = 'account-1';
  serverAccountName = 'Account';
  serverSessionId = 'session-1';
  latestSessionErrorReporter = null;
  resetActorCalls.length = 0;
  writes.length = 0;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SessionProvider selected profile bootstrap', () => {
  it('keeps the server default hidden until the saved profile is verified', async () => {
    let resolveProfileRead!: (profileId: string | null) => void;
    const profileRead = new Promise<string | null>((resolve) => {
      resolveProfileRead = resolve;
    });
    pendingProfileRead = profileRead;

    await renderProvider();

    assert.deepEqual(readSession(), {
      accountId: 'account-1',
      accountName: 'Account',
      selectedProfileId: null,
      sessionId: 'session-1',
      status: 'valid',
    });

    await act(async () => {
      resolveProfileRead('profile-client');
      await profileRead;
    });
    assert.deepEqual(resetActorCalls, ['profile-client']);

    actorLifecycleKey = 'actor-2';
    serverSelectedProfileId = 'profile-client';
    await updateProvider();

    assert.deepEqual(readSession(), {
      accountId: 'account-1',
      accountName: 'Account',
      selectedProfileId: 'profile-client',
      sessionId: 'session-1',
      status: 'valid',
    });
  });

  it('restores the scoped client profile without rewriting it', async () => {
    persistedProfileId = 'profile-client';

    await renderProvider();

    assert.deepEqual(resetActorCalls, ['profile-client']);
    assert.deepEqual(writes, []);
  });

  it('falls back to the server-selected profile when client storage is empty', async () => {
    await renderProvider();

    assert.deepEqual(resetActorCalls, ['profile-server']);
    assert.deepEqual(writes, [
      { accountId: 'account-1', profileId: 'profile-server', sessionId: 'session-1' },
    ]);
  });

  it('reconciles an actor rejected by the server back to its fallback profile', async () => {
    actorProfileId = 'profile-client';

    await renderProvider();

    assert.deepEqual(resetActorCalls, ['profile-server']);
    assert.deepEqual(writes, [
      { accountId: 'account-1', profileId: 'profile-server', sessionId: 'session-1' },
    ]);
  });

  it('ignores stale actor and auth error reports but retains current-auth identity', async () => {
    await renderProvider();
    assert.ok(latestSessionErrorReporter);
    const firstReporter = latestSessionErrorReporter;

    actorLifecycleKey = 'actor-2';
    await updateProvider();
    assert.ok(latestSessionErrorReporter);
    const secondReporter = latestSessionErrorReporter;
    await act(async () => firstReporter.props.onError('auth-1', 'actor-1'));

    assert.deepEqual(readSession(), {
      accountId: 'account-1',
      accountName: 'Account',
      selectedProfileId: 'profile-server',
      sessionId: 'session-1',
      status: 'valid',
    });

    authLifecycleKey = 'auth-2';
    actorLifecycleKey = 'actor-3';
    serverAccountId = 'account-2';
    serverAccountName = 'Second account';
    serverSessionId = 'session-2';
    serverSelectedProfileId = 'profile-second';
    await updateProvider();
    assert.ok(latestSessionErrorReporter);
    const currentReporter = latestSessionErrorReporter;
    await act(async () => secondReporter.props.onError('auth-1', 'actor-2'));

    assert.deepEqual(readSession(), {
      accountId: 'account-2',
      accountName: 'Second account',
      selectedProfileId: 'profile-second',
      sessionId: 'session-2',
      status: 'valid',
    });

    await act(async () => currentReporter.props.onError('auth-2', 'actor-3'));
    assert.deepEqual(readSession(), {
      accountId: 'account-2',
      accountName: 'Second account',
      selectedProfileId: null,
      sessionId: 'session-2',
      status: 'valid',
    });
  });
});

async function renderProvider() {
  await act(async () => {
    renderer = create(createElement(SessionProvider, null, createElement(SessionProbe)));
  });
  assert.ok(renderer);
}

async function updateProvider() {
  assert.ok(renderer);
  await act(async () => {
    renderer?.update(createElement(SessionProvider, null, createElement(SessionProbe)));
  });
}

function readSession() {
  assert.ok(renderer);
  const sessionProbe = renderer.root.findAll((node) => String(node.type) === 'Session')[0];
  assert.ok(sessionProbe);
  return sessionProbe.props;
}

function SessionProbe() {
  const session = useSession();
  return createElement('Session', session);
}
