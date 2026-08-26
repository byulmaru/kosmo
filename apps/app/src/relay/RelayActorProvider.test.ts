import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { commitLocalUpdate, Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RelayActorSnapshot = {
  clearNativeSession: () => Promise<void>;
  environment: Environment;
  nativeToken: string | null;
  resetActor: (profileId?: string | null) => void;
  setNativeSession: (token: string) => Promise<void>;
};

type RelayActorBoundary = Omit<RelayActorSnapshot, 'environment'>;

let deleteFailure = false;
let deleteItemCallCount = 0;
let renderer: ReactTestRenderer | null = null;
let snapshot: RelayActorSnapshot | null = null;
let storedToken: string | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: { OS: 'native' },
});
mockModule('expo-secure-store', {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  deleteItemAsync: async () => {
    deleteItemCallCount += 1;
    if (deleteFailure) {
      throw new Error('SecureStore delete failure');
    }
    storedToken = null;
  },
  getItemAsync: async () => storedToken,
  isAvailableAsync: async () => true,
  setItemAsync: async (_key: string, value: string) => {
    storedToken = value;
  },
});
mockModule(new URL('../components/Splash.tsx', import.meta.url), {
  Splash: () => null,
});

let RelayActorProvider: ComponentType<
  PropsWithChildren<{ createEnvironment?: (token: string | null) => Environment }>
>;
let useRelayActor: () => RelayActorBoundary;
let useRelayEnvironment: () => Environment;

before(async () => {
  process.env.EXPO_PUBLIC_API_ORIGIN = 'http://127.0.0.1:4000';
  process.env.EXPO_PUBLIC_OIDC_ISSUER = 'https://oidc.example.com';
  process.env.EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID = 'kosmo-native';
  ({ RelayActorProvider, useRelayActor } = await import('./RelayActorProvider'));
  ({ useRelayEnvironment } = await import('react-relay'));
});

beforeEach(() => {
  deleteFailure = false;
  deleteItemCallCount = 0;
  snapshot = null;
  storedToken = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

function createEnvironment(token: string | null): Environment {
  return new Environment({
    network: Network.create(async () => ({ data: { token } })),
    store: new Store(new RecordSource()),
  });
}

function Probe() {
  const actor = useRelayActor();
  snapshot = {
    clearNativeSession: actor.clearNativeSession,
    environment: useRelayEnvironment(),
    nativeToken: actor.nativeToken,
    resetActor: actor.resetActor,
    setNativeSession: actor.setNativeSession,
  };
  return null;
}

async function renderProvider() {
  await act(async () => {
    renderer = create(
      createElement(RelayActorProvider, { createEnvironment }, createElement(Probe)),
    );
  });
  assert.ok(snapshot);
}

describe('RelayActorProvider session cleanup', () => {
  it('actor reset은 같은 app lifecycle에서 이전 Store를 새 Store로 교체한다', async () => {
    await renderProvider();

    assert.ok(snapshot);
    const previousEnvironment = snapshot.environment;
    commitLocalUpdate(previousEnvironment, (store) => {
      const connection = store.create('local-connection', 'PostConnection');
      const edge = store.create('local-edge', 'PostEdge');
      edge.setValue('old-local-cursor', 'cursor');
      connection.setLinkedRecords([edge], 'edges');
    });

    await act(async () => snapshot?.resetActor(null));

    assert.ok(snapshot);
    assert.notEqual(snapshot.environment, previousEnvironment);
    assert.notEqual(snapshot.environment.getStore(), previousEnvironment.getStore());
    assert.equal(snapshot.environment.getStore().getSource().get('local-connection'), undefined);
    assert.equal(snapshot.environment.getStore().getSource().get('local-edge'), undefined);
  });

  it('SecureStore token을 삭제하고 이전 Store를 새 guest Store와 다음 Session에서 재사용하지 않는다', async () => {
    await renderProvider();
    await act(async () => snapshot?.setNativeSession('first-session-token'));

    assert.ok(snapshot);
    assert.equal(snapshot.nativeToken, 'first-session-token');
    assert.notEqual(storedToken, null);
    const authenticatedEnvironment = snapshot.environment;
    commitLocalUpdate(authenticatedEnvironment, (store) => {
      store.create('old-viewer', 'Profile').setValue('이전 사용자', 'displayName');
    });

    await act(async () => snapshot?.clearNativeSession());

    assert.ok(snapshot);
    assert.equal(deleteItemCallCount, 1);
    assert.equal(storedToken, null);
    assert.equal(snapshot.nativeToken, null);
    assert.notEqual(snapshot.environment, authenticatedEnvironment);
    assert.notEqual(snapshot.environment.getStore(), authenticatedEnvironment.getStore());
    assert.equal(snapshot.environment.getStore().getSource().get('old-viewer'), undefined);
    const guestEnvironment = snapshot.environment;

    await act(async () => snapshot?.setNativeSession('next-session-token'));

    assert.ok(snapshot);
    assert.equal(snapshot.nativeToken, 'next-session-token');
    assert.notEqual(snapshot.environment, guestEnvironment);
    assert.notEqual(snapshot.environment, authenticatedEnvironment);
    assert.equal(snapshot.environment.getStore().getSource().get('old-viewer'), undefined);
  });

  it('SecureStore 삭제 실패에서는 기존 token과 Store를 유지한다', async () => {
    await renderProvider();
    await act(async () => snapshot?.setNativeSession('retained-session-token'));

    assert.ok(snapshot);
    const authenticatedEnvironment = snapshot.environment;
    const retainedStoredToken = storedToken;
    deleteFailure = true;
    let cleanupError: unknown;

    await act(async () => {
      try {
        await snapshot?.clearNativeSession();
      } catch (error) {
        cleanupError = error;
      }
    });

    assert.ok(snapshot);
    assert.match(String(cleanupError), /SecureStore delete failure/);
    assert.equal(deleteItemCallCount, 1);
    assert.equal(storedToken, retainedStoredToken);
    assert.equal(snapshot.nativeToken, 'retained-session-token');
    assert.equal(snapshot.environment, authenticatedEnvironment);
  });
});
