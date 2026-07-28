import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { LogoutState } from './logout';

type NativeCommitOptions = {
  onCompleted: (
    response: { revokeCurrentSession: { completed: boolean } },
    errors?: unknown,
  ) => void;
  onError: (error: Error) => void;
};

type State = {
  clearNativeSession: () => Promise<void>;
  commitNativeLogout: (options: NativeCommitOptions) => void;
  errors: unknown[];
  events: string[];
  routerReplace: (href: string) => void;
};

function createState(): State {
  return {
    clearNativeSession: async () => {
      state.events.push('clear-native-session');
    },
    commitNativeLogout: ({ onCompleted }) => {
      state.events.push('request-native-logout');
      onCompleted({ revokeCurrentSession: { completed: true } });
    },
    errors: [],
    events: [],
    routerReplace: (href) => {
      assert.equal(href, '/');
      state.events.push('replace-root');
    },
  };
}

let state = createState();

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useRouter: () => ({ replace: state.routerReplace }),
});
mockModule('react', {
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(initial: T) => {
    let current = initial;
    const setValue = (next: T | ((value: T) => T)) => {
      current = typeof next === 'function' ? (next as (value: T) => T)(current) : next;
      state.errors.push(current);
    };
    return [current, setValue] as const;
  },
});
mockModule('react-native', {
  Platform: { OS: 'native' },
});
mockModule('react-relay', {
  graphql: () => ({}),
  useMutation: () => [(options: NativeCommitOptions) => state.commitNativeLogout(options)],
});
mockModule(new URL('../auth/logout.ts', import.meta.url), {
  LOGOUT_FAILURE_MESSAGE: '로그아웃하지 못했습니다. 다시 시도해주세요.',
  requestWebLogout: async () => {},
});
mockModule(new URL('../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActor: () => ({
    clearNativeSession: () => state.clearNativeSession(),
    resetActor: () => {},
  }),
});

let useLogout: () => LogoutState;

before(async () => {
  ({ useLogout } = await import('./logout'));
});

beforeEach(() => {
  state = createState();
});

async function flushLogout() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('useLogout production composition', () => {
  it('Native는 실제 Relay mutation 성공 뒤 SecureStore와 actor를 정리하고 root로 replace한다', async () => {
    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, [
      'request-native-logout',
      'clear-native-session',
      'replace-root',
    ]);
  });

  it('Native mutation 실패에서는 credential과 route를 유지하고 오류를 기록한다', async () => {
    state.commitNativeLogout = ({ onError }) => {
      state.events.push('request-native-logout');
      onError(new Error('GraphQL failure'));
    };

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, ['request-native-logout']);
    assert.ok(state.errors.includes('로그아웃하지 못했습니다. 다시 시도해주세요.'));
  });

  it('Native mutation이 완료되지 않은 결과를 반환하면 credential과 route를 유지한다', async () => {
    state.commitNativeLogout = ({ onCompleted }) => {
      state.events.push('request-native-logout');
      onCompleted({ revokeCurrentSession: { completed: false } });
    };

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, ['request-native-logout']);
    assert.ok(state.errors.includes('로그아웃하지 못했습니다. 다시 시도해주세요.'));
  });

  it('Native credential 정리가 실패하면 완료 화면으로 이동하지 않는다', async () => {
    state.clearNativeSession = async () => {
      state.events.push('clear-native-session');
      throw new Error('SecureStore failure');
    };

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, ['request-native-logout', 'clear-native-session']);
    assert.ok(state.errors.includes('로그아웃하지 못했습니다. 다시 시도해주세요.'));
  });
});
