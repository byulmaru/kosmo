import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

type PlatformName = 'native' | 'web';

const platform: { OS: PlatformName } = { OS: 'web' };
const webValues = new Map<string, string>();
let nativeValue: string | null = null;
let nativeReadFailure = false;
let nativeWriteFailure = false;
let nativeDeleteFailure = false;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: platform });
mockModule('expo-secure-store', {
  deleteItemAsync: async () => {
    if (nativeDeleteFailure) {
      throw new Error('native delete failed');
    }
    nativeValue = null;
  },
  getItemAsync: async () => {
    if (nativeReadFailure) {
      throw new Error('native read failed');
    }
    return nativeValue;
  },
  setItemAsync: async (_key: string, value: string) => {
    if (nativeWriteFailure) {
      throw new Error('native write failed');
    }
    nativeValue = value;
  },
});

let deleteSelectedProfile: () => Promise<void>;
let readSelectedProfile: (scope: {
  accountId: string;
  sessionId: string;
}) => Promise<string | null>;
let writeSelectedProfile: (
  scope: { accountId: string; sessionId: string },
  profileId: string,
) => Promise<void>;

before(async () => {
  ({ deleteSelectedProfile, readSelectedProfile, writeSelectedProfile } =
    await import('./selectedProfileStorage'));
});

beforeEach(() => {
  platform.OS = 'web';
  webValues.clear();
  nativeValue = null;
  nativeReadFailure = false;
  nativeWriteFailure = false;
  nativeDeleteFailure = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => webValues.get(key) ?? null,
      removeItem: (key: string) => void webValues.delete(key),
      setItem: (key: string, value: string) => void webValues.set(key, value),
    },
  });
});

describe('selected profile storage', () => {
  const scope = { accountId: 'account-1', sessionId: 'session-1' };

  it('Web은 현재 account/session에 저장한 profile만 복원한다', async () => {
    await writeSelectedProfile(scope, 'profile-a');

    assert.equal(await readSelectedProfile(scope), 'profile-a');
    assert.equal(
      await readSelectedProfile({ accountId: 'account-2', sessionId: 'session-1' }),
      null,
    );
    assert.equal(
      await readSelectedProfile({ accountId: 'account-1', sessionId: 'session-2' }),
      null,
    );
  });

  it('Native는 SecureStore에 저장하고 logout 시 값을 삭제한다', async () => {
    platform.OS = 'native';

    await writeSelectedProfile(scope, 'profile-b');
    assert.equal(await readSelectedProfile(scope), 'profile-b');

    await deleteSelectedProfile();
    assert.equal(await readSelectedProfile(scope), null);
  });

  it('Native SecureStore 실패는 session 동작을 막지 않는다', async () => {
    platform.OS = 'native';
    nativeWriteFailure = true;
    nativeReadFailure = true;
    nativeDeleteFailure = true;

    await writeSelectedProfile(scope, 'profile-a');
    assert.equal(await readSelectedProfile(scope), null);
    await deleteSelectedProfile();
  });
});
