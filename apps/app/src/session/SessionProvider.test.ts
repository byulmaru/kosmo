import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, StrictMode } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let actorProfileId: string | null = null;
let persistedProfileId: string | null = null;
let pendingProfileRead: Promise<string | null> | null = null;
let pendingProfileDelete: Promise<void> | null = null;
let readCalls = 0;
let deleteCalls = 0;
let serverSelectedProfileId: string | null = 'profile-server';
let authLifecycleKey = 'auth-1';
let actorLifecycleKey = 'actor-1';
let serverAccountId: string | null = 'account-1';
let serverAccountName: string | null = 'Account';
let serverSessionId: string | null = 'session-1';
let serverSessionAccountId: string | null = null;
let serverOperationalOnly = false;
let nativeToken: string | null = null;
let nativeClearCalls = 0;
let nativeClearFails = false;
let strictMode = false;
let deferActorReset = false;
const resetActorCalls: Array<string | null | undefined> = [];
const writes: string[] = [];
const clearNativeSession = async () => {
  nativeClearCalls += 1;
  if (nativeClearFails) {
    throw new Error('native session cleanup failed');
  }
};
const resetActor = (profileId?: string | null) => {
  resetActorCalls.push(profileId);
  if (!deferActorReset) {
    actorProfileId = profileId ?? null;
  }
};
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
          accountId: serverSessionAccountId ?? serverAccountId,
          id: serverSessionId,
          operationalOnly: serverOperationalOnly,
          selectedProfile: serverSelectedProfileId ? { id: serverSelectedProfileId } : null,
        }
      : null,
    me: serverAccountId ? { id: serverAccountId, name: serverAccountName } : null,
  }),
});
mockModule('@/auth/selectedProfileStorage', {
  deleteSelectedProfile: () => {
    deleteCalls += 1;
    return pendingProfileDelete ?? Promise.resolve();
  },
  readSelectedProfile: () => {
    readCalls += 1;
    return pendingProfileRead ?? Promise.resolve(persistedProfileId);
  },
  writeSelectedProfile: async (profileId: string) => {
    writes.push(profileId);
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
    clearNativeSession,
    nativeToken,
    resetActor,
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
  pendingProfileDelete = null;
  readCalls = 0;
  deleteCalls = 0;
  serverSelectedProfileId = 'profile-server';
  authLifecycleKey = 'auth-1';
  actorLifecycleKey = 'actor-1';
  serverAccountId = 'account-1';
  serverAccountName = 'Account';
  serverSessionId = 'session-1';
  serverSessionAccountId = null;
  serverOperationalOnly = false;
  platform.OS = 'web';
  nativeToken = null;
  nativeClearCalls = 0;
  nativeClearFails = false;
  strictMode = false;
  deferActorReset = false;
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

  it('keeps Session identity for an operational-only account without restoring or deleting its Profile', async () => {
    actorProfileId = 'profile-server';
    persistedProfileId = 'profile-server';
    serverAccountId = null;
    serverAccountName = null;
    serverSessionAccountId = 'account-1';
    serverSelectedProfileId = null;
    serverOperationalOnly = true;

    await renderProvider();

    assert.deepEqual(readSession(), {
      accountId: 'account-1',
      accountName: null,
      selectedProfileId: null,
      sessionId: 'session-1',
      status: 'operational',
    });
    assert.deepEqual(resetActorCalls, [null]);
    assert.equal(readCalls, 0);
    assert.equal(deleteCalls, 0);
    assert.deepEqual(writes, []);
  });

  it('keeps active Session identity when no Profile is selected', async () => {
    serverSelectedProfileId = null;

    await renderProvider();

    assert.deepEqual(readSession(), {
      accountId: 'account-1',
      accountName: 'Account',
      selectedProfileId: null,
      sessionId: 'session-1',
      status: 'valid',
    });
    assert.equal(deleteCalls, 0);
  });

  it('falls back to the server-selected profile when client storage is empty', async () => {
    await renderProvider();

    assert.deepEqual(resetActorCalls, ['profile-server']);
    assert.deepEqual(writes, ['profile-server']);
  });

  it('reconciles an actor rejected by the server back to its fallback profile', async () => {
    actorProfileId = 'profile-client';

    await renderProvider();

    assert.deepEqual(resetActorCalls, ['profile-server']);
    assert.deepEqual(writes, ['profile-server']);
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
    await act(async () => {
      await Promise.resolve();
    });
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

  it('cleans selected-profile storage for a confirmed guest without delaying guest identity', async () => {
    let resolveDelete!: () => void;
    const deletion = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    pendingProfileDelete = deletion;
    serverSessionId = null;
    serverAccountId = null;

    await renderProvider();

    assert.equal(readSession().status, 'guest');
    assert.equal(deleteCalls, 1);
    assert.equal(readCalls, 0);
    assert.deepEqual(resetActorCalls, []);

    await act(async () => {
      resolveDelete();
      await deletion;
    });
  });

  it('waits for account-change cleanup before reading or writing the new default', async () => {
    actorProfileId = 'profile-a';
    serverSelectedProfileId = 'profile-a';
    let resolveDelete!: () => void;
    const deletion = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    pendingProfileDelete = deletion;

    await renderProvider();
    assert.equal(readCalls, 0);
    assert.equal(deleteCalls, 0);

    serverAccountId = 'account-2';
    serverAccountName = 'Second account';
    serverSessionId = 'session-2';
    serverSelectedProfileId = 'profile-b';
    authLifecycleKey = 'auth-2';
    await updateProvider();
    assert.deepEqual(resetActorCalls, [null]);
    assert.equal(deleteCalls, 1);

    actorLifecycleKey = 'actor-2';
    await updateProvider();
    assert.equal(readCalls, 0);
    assert.deepEqual(writes, []);

    await act(async () => {
      resolveDelete();
      await deletion;
    });
    assert.equal(readCalls, 1);
    assert.deepEqual(writes, ['profile-b']);
    assert.deepEqual(resetActorCalls, [null, 'profile-b']);
  });

  it('does not reconcile a replayed stale actor snapshot before account-change cleanup', async () => {
    actorProfileId = 'profile-a';
    serverSelectedProfileId = 'profile-a';
    await renderProvider();

    let resolveDelete!: () => void;
    const deletion = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    pendingProfileDelete = deletion;
    deferActorReset = true;
    serverAccountId = 'account-2';
    serverAccountName = 'Second account';
    serverSessionId = 'session-2';
    serverSelectedProfileId = 'profile-b';
    await updateProvider();
    assert.deepEqual(resetActorCalls, [null]);

    actorLifecycleKey = 'actor-2';
    await updateProvider();
    assert.equal(readCalls, 0);
    assert.deepEqual(writes, []);
    assert.deepEqual(resetActorCalls, [null]);

    await act(async () => {
      resolveDelete();
      await deletion;
    });
    assert.deepEqual(writes, ['profile-b']);
    assert.deepEqual(resetActorCalls, [null, 'profile-b']);
  });

  it('reuses a pending restore through StrictMode effect replay and applies it once', async () => {
    let resolveProfileRead!: (profileId: string | null) => void;
    const profileRead = new Promise<string | null>((resolve) => {
      resolveProfileRead = resolve;
    });
    pendingProfileRead = profileRead;
    strictMode = true;

    await renderProvider();
    assert.equal(readCalls, 1);

    await act(async () => {
      resolveProfileRead('profile-client');
      await profileRead;
    });
    assert.deepEqual(resetActorCalls, ['profile-client']);
    assert.equal(readCalls, 1);
  });

  it('does not loop on a cached id rejected by a null server selection and later uses the server fallback', async () => {
    persistedProfileId = 'profile-client';
    serverSelectedProfileId = null;

    await renderProvider();
    assert.deepEqual(resetActorCalls, ['profile-client']);
    assert.equal(readCalls, 1);

    actorLifecycleKey = 'actor-2';
    await updateProvider();
    assert.deepEqual(resetActorCalls, ['profile-client', null]);
    assert.equal(deleteCalls, 0);

    actorLifecycleKey = 'actor-3';
    await updateProvider();
    assert.equal(readCalls, 1);
    assert.equal(deleteCalls, 0);

    serverSelectedProfileId = 'profile-server-later';
    actorLifecycleKey = 'actor-4';
    await updateProvider();
    assert.equal(readCalls, 1);
    assert.deepEqual(writes, ['profile-server-later']);
    assert.deepEqual(resetActorCalls, ['profile-client', null, 'profile-server-later']);
  });

  it('keeps verified guest identity and selected-profile cleanup when native token cleanup fails', async () => {
    platform.OS = 'ios';
    nativeToken = 'stale-token';
    nativeClearFails = true;
    serverSessionId = null;
    serverAccountId = null;

    await renderProvider();

    assert.equal(nativeClearCalls, 1);
    assert.equal(deleteCalls, 1);
    assert.deepEqual(readSession(), {
      accountId: null,
      accountName: null,
      selectedProfileId: null,
      sessionId: null,
      status: 'guest',
    });
  });

  it('does not clear selection storage for actor changes, re-queries, or stale reports', async () => {
    actorProfileId = 'profile-server';
    await renderProvider();
    assert.equal(deleteCalls, 0);

    actorLifecycleKey = 'actor-2';
    await updateProvider();
    assert.equal(deleteCalls, 0);

    assert.ok(latestSessionErrorReporter);
    await act(async () => latestSessionErrorReporter?.props.onError('stale-auth', 'stale-actor'));
    await updateProvider();
    assert.equal(deleteCalls, 0);
  });
});

async function renderProvider() {
  await act(async () => {
    renderer = create(providerElement());
  });
  assert.ok(renderer);
}

async function updateProvider() {
  assert.ok(renderer);
  await act(async () => {
    renderer?.update(providerElement());
  });
}

function providerElement() {
  const provider = createElement(SessionProvider, null, createElement(SessionProbe));
  return strictMode ? createElement(StrictMode, null, provider) : provider;
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
