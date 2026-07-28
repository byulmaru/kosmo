import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import type { LogoutState } from './logout';

type Runtime = 'native' | 'web';
type NativeCommitOptions = {
  onCompleted: (
    response: { revokeCurrentSession: { completed: boolean } },
    errors?: unknown,
  ) => void;
  onError: (error: Error) => void;
};

const state: {
  clearNativeSession: () => Promise<void>;
  commitNativeLogout: (options: NativeCommitOptions) => void;
  errors: unknown[];
  events: string[];
  platform: Runtime;
  requestWebLogout: () => Promise<void>;
  resetActor: (profileId: string | null) => void;
  routerReplace: (href: string) => void;
  pendingNativeCompletion: (() => void) | null;
} = {
  clearNativeSession: async () => {
    state.events.push('clear-native-session');
  },
  commitNativeLogout: ({ onCompleted }) => {
    state.events.push('request-native-logout');
    onCompleted({ revokeCurrentSession: { completed: true } });
  },
  errors: [],
  events: [],
  pendingNativeCompletion: null,
  platform: 'native',
  requestWebLogout: async () => {
    state.events.push('request-web-logout');
  },
  resetActor: (profileId) => {
    assert.equal(profileId, null);
    state.events.push('reset-web-actor');
  },
  routerReplace: (href) => {
    assert.equal(href, '/');
    state.events.push('replace-root');
  },
};

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
  Platform: {
    get OS() {
      return state.platform;
    },
  },
});
mockModule('react-relay', {
  graphql: () => ({}),
  useMutation: () => [(options: NativeCommitOptions) => state.commitNativeLogout(options)],
});
mockModule(new URL('../auth/logout.ts', import.meta.url), {
  LOGOUT_FAILURE_MESSAGE: '로그아웃하지 못했습니다. 다시 시도해주세요.',
  requestWebLogout: () => state.requestWebLogout(),
});
mockModule(new URL('../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActor: () => ({
    clearNativeSession: () => state.clearNativeSession(),
    resetActor: (profileId?: string | null) => state.resetActor(profileId ?? null),
  }),
});

let useLogout: () => LogoutState;

before(async () => {
  ({ useLogout } = await import('./logout'));
});

function resetState() {
  state.clearNativeSession = async () => {
    state.events.push('clear-native-session');
  };
  state.commitNativeLogout = ({ onCompleted }) => {
    state.events.push('request-native-logout');
    onCompleted({ revokeCurrentSession: { completed: true } });
  };
  state.errors = [];
  state.events = [];
  state.pendingNativeCompletion = null;
  state.platform = 'native';
  state.requestWebLogout = async () => {
    state.events.push('request-web-logout');
  };
  state.resetActor = (profileId) => {
    assert.equal(profileId, null);
    state.events.push('reset-web-actor');
  };
  state.routerReplace = (href) => {
    assert.equal(href, '/');
    state.events.push('replace-root');
  };
}

async function flushLogout() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('useLogout production composition', () => {
  it('Web은 BFF 성공 뒤 actor를 reset하고 root로 replace한다', async () => {
    resetState();
    state.platform = 'web';

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, ['request-web-logout', 'reset-web-actor', 'replace-root']);
  });

  it('Web BFF 실패에서는 actor와 route를 유지하고 오류를 기록한다', async () => {
    resetState();
    state.platform = 'web';
    state.requestWebLogout = async () => {
      state.events.push('request-web-logout');
      throw new Error('network failure');
    };

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, ['request-web-logout']);
    assert.ok(state.errors.includes('로그아웃하지 못했습니다. 다시 시도해주세요.'));
  });

  it('Native는 실제 Relay mutation 성공 뒤 SecureStore와 actor를 정리하고 root로 replace한다', async () => {
    resetState();

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, [
      'request-native-logout',
      'clear-native-session',
      'replace-root',
    ]);
  });

  it('Native mutation 실패에서는 credential과 route를 유지하고 오류를 기록한다', async () => {
    resetState();
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
    resetState();
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
    resetState();
    state.clearNativeSession = async () => {
      state.events.push('clear-native-session');
      throw new Error('SecureStore failure');
    };

    useLogout().logout();
    await flushLogout();

    assert.deepEqual(state.events, ['request-native-logout', 'clear-native-session']);
    assert.ok(state.errors.includes('로그아웃하지 못했습니다. 다시 시도해주세요.'));
  });

  it('처리 중 재호출은 두 번째 server 요청을 만들지 않는다', async () => {
    resetState();
    state.commitNativeLogout = ({ onCompleted }) => {
      state.events.push('request-native-logout');
      state.pendingNativeCompletion = () =>
        onCompleted({ revokeCurrentSession: { completed: true } });
    };

    const logout = useLogout().logout;
    logout();
    logout();
    assert.deepEqual(state.events, ['request-native-logout']);

    state.pendingNativeCompletion?.();
    await flushLogout();
    assert.deepEqual(state.events, [
      'request-native-logout',
      'clear-native-session',
      'replace-root',
    ]);
  });
});
