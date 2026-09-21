import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let actorProfileId: string | null = null;
let persistedProfileId: string | null = null;
let serverSelectedProfileId: string | null = 'profile-server';
const resetActorCalls: Array<string | null | undefined> = [];
const writes: Array<{ accountId: string; profileId: string; sessionId: string }> = [];
let renderer: ReactTestRenderer | null = null;
let SessionProvider: ComponentType<PropsWithChildren>;
let useSession: () => {
  accountId: string | null;
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
    currentSession: {
      id: 'session-1',
      selectedProfile: serverSelectedProfileId ? { id: serverSelectedProfileId } : null,
    },
    me: { id: 'account-1', name: 'Account' },
  }),
});
mockModule('@/auth/selectedProfileStorage', {
  deleteSelectedProfile: async () => undefined,
  readSelectedProfile: async () => persistedProfileId,
  writeSelectedProfile: async (
    scope: { accountId: string; sessionId: string },
    profileId: string,
  ) => {
    writes.push({ ...scope, profileId });
  },
});
mockModule('@/components/RelayFailOpenBoundary', {
  RelayFailOpenBoundary: ({ children }: PropsWithChildren) => children,
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
  useRelayActorLifecycleKey: () => 'actor-lifecycle',
});

before(async () => {
  ({ SessionProvider, useSession } = await import('./SessionProvider'));
});

beforeEach(() => {
  actorProfileId = null;
  persistedProfileId = null;
  serverSelectedProfileId = 'profile-server';
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
});

async function renderProvider() {
  await act(async () => {
    renderer = create(createElement(SessionProvider, null, createElement(SessionProbe)));
  });
  assert.ok(renderer);
}

function SessionProbe() {
  const session = useSession();
  return createElement('Session', session);
}
