import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

type PlatformName = 'native' | 'web';

const platform: { OS: PlatformName } = { OS: 'web' };
const webValues = new Map<string, string>();
let webStorageFailure = false;
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
let readSelectedProfile: () => Promise<string | null>;
let writeSelectedProfile: (profileId: string) => Promise<void>;

before(async () => {
  ({ deleteSelectedProfile, readSelectedProfile, writeSelectedProfile } =
    await import('./selectedProfileStorage'));
});

beforeEach(() => {
  platform.OS = 'web';
  webStorageFailure = false;
  webValues.clear();
  nativeValue = null;
  nativeReadFailure = false;
  nativeWriteFailure = false;
  nativeDeleteFailure = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => {
        if (webStorageFailure) {
          throw new Error('web read failed');
        }
        return webValues.get(key) ?? null;
      },
      removeItem: (key: string) => {
        if (webStorageFailure) {
          throw new Error('web delete failed');
        }
        webValues.delete(key);
      },
      setItem: (key: string, value: string) => {
        if (webStorageFailure) {
          throw new Error('web write failed');
        }
        webValues.set(key, value);
      },
    },
  });
});

describe('selected profile storage', () => {
  it('Web은 profileId만 저장하고 복원한다', async () => {
    await writeSelectedProfile('profile-a');

    assert.equal(
      webValues.get('kosmo:selected-profile'),
      JSON.stringify({ profileId: 'profile-a' }),
    );
    assert.equal(await readSelectedProfile(), 'profile-a');
  });

  it('legacy JSON의 account/session metadata를 무시하고 profileId를 복원한다', async () => {
    webValues.set(
      'kosmo:selected-profile',
      JSON.stringify({
        accountId: 'another-account',
        sessionId: 'old-session',
        profileId: 'profile-a',
      }),
    );

    assert.equal(await readSelectedProfile(), 'profile-a');
  });

  it('빈 profileId와 손상된 JSON은 복원하지 않는다', async () => {
    webValues.set('kosmo:selected-profile', JSON.stringify({ profileId: '' }));
    assert.equal(await readSelectedProfile(), null);

    webValues.set('kosmo:selected-profile', '{');
    assert.equal(await readSelectedProfile(), null);
  });

  it('Web Storage 실패는 profile storage 동작을 막지 않는다', async () => {
    webStorageFailure = true;

    await writeSelectedProfile('profile-a');
    assert.equal(await readSelectedProfile(), null);
    await deleteSelectedProfile();
  });

  it('Native는 SecureStore에 저장하고 logout 시 값을 삭제한다', async () => {
    platform.OS = 'native';

    await writeSelectedProfile('profile-b');
    assert.equal(await readSelectedProfile(), 'profile-b');

    await deleteSelectedProfile();
    assert.equal(await readSelectedProfile(), null);
  });

  it('Native SecureStore 실패는 session 동작을 막지 않는다', async () => {
    platform.OS = 'native';
    nativeWriteFailure = true;
    nativeReadFailure = true;
    nativeDeleteFailure = true;

    await writeSelectedProfile('profile-a');
    assert.equal(await readSelectedProfile(), null);
    await deleteSelectedProfile();
  });
});
