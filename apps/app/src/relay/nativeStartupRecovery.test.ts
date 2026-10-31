import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NativeStartupRecovery } from './nativeStartupRecovery';
import { executeGraphQLRequest, GraphQLHttpError } from './network';
import { RelayTransportError } from './transportError';
import type { AppStateStatus } from 'react-native';

const query = {
  cacheID: 'startup',
  id: null,
  metadata: {},
  name: 'SessionProviderQuery',
  operationKind: 'query' as const,
  text: 'query SessionProviderQuery { currentSession { id } }',
};
const payload = { data: { currentSession: { id: 'session-a' } } };
const response = () => new Response(JSON.stringify(payload), { status: 200 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function appState(initial: AppStateStatus = 'active') {
  const listeners = new Set<(state: AppStateStatus) => void>();
  return {
    currentState: initial,
    listeners,
    addEventListener(_event: 'change', listener: (state: AppStateStatus) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(state: AppStateStatus) {
      this.currentState = state;
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}

async function native<T>(run: () => Promise<T>, product = 'ReactNative'): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { product },
  });
  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  }
}

describe('Native 초기 조회의 잠금·복귀 복구', () => {
  for (const transitions of [['inactive', 'background'], ['background']] as const) {
    it(`${transitions.join(' → ')} 중 실패한 조회는 active 후 같은 credential·Profile·변수로 한 번 재전송한다`, () =>
      native(async () => {
        const state = appState();
        const recovery = new NativeStartupRecovery(state);
        const first = deferred<Response>();
        const sent: RequestInit[] = [];
        const fetchRequest: typeof fetch = async (_url, init) => {
          sent.push(init!);
          return sent.length === 1 ? first.promise : response();
        };
        const pending = executeGraphQLRequest(
          query,
          { first: 20 },
          'token-a',
          fetchRequest,
          'profile-a',
          recovery,
        );
        for (const transition of transitions) {
          state.change(transition);
        }
        first.reject(new TypeError('connection lost'));
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(sent.length, 1);
        state.change('active');
        state.change('active');
        assert.deepEqual(await pending, payload);
        assert.equal(sent.length, 2);
        assert.deepEqual(sent[1], sent[0]);
        assert.equal((sent[1].headers as Record<string, string>).authorization, 'Bearer token-a');
        assert.deepEqual(JSON.parse(String(sent[1].body)), {
          operationName: 'SessionProviderQuery',
          query: query.text,
          variables: { first: 20 },
          extensions: { selectedProfileId: 'profile-a' },
        });
        assert.equal(state.listeners.size, 0);
      }));
  }

  it('token 복원 뒤 background 상태에서 시작한 초기 조회도 active를 기다려 복구한다', () =>
    native(async () => {
      const state = appState('background');
      const first = deferred<Response>();
      let calls = 0;
      const pending = executeGraphQLRequest(
        query,
        {},
        'restored-token',
        async () => {
          calls += 1;
          return calls === 1 ? first.promise : response();
        },
        'profile-a',
        new NativeStartupRecovery(state),
      );
      first.reject(new TypeError('background connection lost'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(calls, 1);
      state.change('active');
      assert.deepEqual(await pending, payload);
      assert.equal(calls, 2);
      assert.equal(state.listeners.size, 0);
    }));

  it('복귀 뒤 늦게 도착한 원래 fetch 실패도 한 번 복구한다', () =>
    native(async () => {
      const state = appState();
      const first = deferred<Response>();
      let calls = 0;
      const pending = executeGraphQLRequest(
        query,
        {},
        null,
        async () => {
          calls += 1;
          return calls === 1 ? first.promise : response();
        },
        null,
        new NativeStartupRecovery(state),
      );
      state.change('background');
      state.change('active');
      first.reject(new TypeError('late connection lost'));
      assert.deepEqual(await pending, payload);
      assert.equal(calls, 2);
      assert.equal(state.listeners.size, 0);
    }));

  it('복귀 후에도 pending인 원래 요청이 성공하면 중복 요청을 보내지 않는다', () =>
    native(async () => {
      const state = appState();
      const first = deferred<Response>();
      let calls = 0;
      const pending = executeGraphQLRequest(
        query,
        {},
        null,
        async () => {
          calls += 1;
          return first.promise;
        },
        null,
        new NativeStartupRecovery(state),
      );
      state.change('background');
      state.change('active');
      assert.equal(calls, 1);
      first.resolve(response());
      assert.deepEqual(await pending, payload);
      state.change('background');
      state.change('active');
      assert.equal(calls, 1);
      assert.equal(state.listeners.size, 0);
    }));

  it('재시도 중 다시 잠가도 두 번째 실패를 전달하고 수동 요청으로 복구한다', () =>
    native(async () => {
      const state = appState();
      const recovery = new NativeStartupRecovery(state);
      const attempts = [deferred<Response>(), deferred<Response>()];
      let calls = 0;
      const fetchRequest: typeof fetch = async () => {
        calls += 1;
        return calls <= 2 ? attempts[calls - 1].promise : response();
      };
      const pending = executeGraphQLRequest(
        query,
        {},
        'retained',
        fetchRequest,
        'profile-a',
        recovery,
      );
      const rejected = assert.rejects(pending, (error: unknown) => {
        assert.ok(error instanceof RelayTransportError);
        assert.equal(error.message, 'retry offline');
        return true;
      });
      state.change('background');
      state.change('active');
      attempts[0].reject(new TypeError('first offline'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(calls, 2);
      state.change('inactive');
      state.change('background');
      state.change('active');
      state.change('active');
      attempts[1].reject(new TypeError('retry offline'));
      await rejected;
      state.change('background');
      state.change('active');
      assert.equal(calls, 2);
      assert.equal(state.listeners.size, 0);
      assert.deepEqual(
        await executeGraphQLRequest(query, {}, 'retained', fetchRequest, 'profile-a', recovery),
        payload,
      );
      assert.equal(calls, 3);
    }));

  it('foreground에서 실패한 초기 조회는 재시도하지 않는다', () =>
    native(async () => {
      const state = appState();
      let calls = 0;
      await assert.rejects(
        executeGraphQLRequest(
          query,
          {},
          null,
          async () => {
            calls += 1;
            throw new TypeError('ordinary offline');
          },
          null,
          new NativeStartupRecovery(state),
        ),
        RelayTransportError,
      );
      assert.equal(calls, 1);
      assert.equal(state.listeners.size, 0);
    }));

  for (const mode of ['web', 'mutation', 'ordinary', 'completed'] as const) {
    it(`${mode} 요청은 잠금·복귀해도 자동 재실행하지 않는다`, () =>
      native(
        async () => {
          const state = appState();
          const recovery = new NativeStartupRecovery(state);
          if (mode === 'completed') {
            recovery.sessionReady();
            recovery.complete();
          }
          let calls = 0;
          await assert.rejects(
            executeGraphQLRequest(
              mode === 'mutation' ? { ...query, operationKind: 'mutation' } : query,
              {},
              null,
              async () => {
                calls += 1;
                state.change('background');
                state.change('active');
                throw new TypeError('connection lost');
              },
              null,
              mode === 'ordinary' ? undefined : recovery,
            ),
            RelayTransportError,
          );
          assert.equal(calls, 1);
          assert.equal(state.listeners.size, 0);
        },
        mode === 'web' ? 'Web' : 'ReactNative',
      ));
  }

  it('초기 로딩 완료 뒤에도 이미 시작한 중단 요청의 복구 기회는 유지한다', () =>
    native(async () => {
      const state = appState();
      const recovery = new NativeStartupRecovery(state);
      const first = deferred<Response>();
      let calls = 0;
      const pending = executeGraphQLRequest(
        query,
        {},
        null,
        async () => {
          calls += 1;
          return calls === 1 ? first.promise : response();
        },
        null,
        recovery,
      );
      state.change('background');
      recovery.sessionReady();
      recovery.complete();
      first.reject(new TypeError('connection lost'));
      state.change('active');
      assert.deepEqual(await pending, payload);
      assert.equal(calls, 2);
    }));

  for (const status of [200, 503]) {
    it(`잠금·복귀 중 HTTP ${status}의 GraphQL 오류는 재실행하지 않는다`, () =>
      native(async () => {
        const state = appState();
        let calls = 0;
        const pending = executeGraphQLRequest(
          query,
          {},
          null,
          async () => {
            calls += 1;
            state.change('background');
            state.change('active');
            return new Response(JSON.stringify({ errors: [{ message: 'server failed' }] }), {
              status,
            });
          },
          null,
          new NativeStartupRecovery(state),
        );
        if (status === 503) {
          await assert.rejects(pending, GraphQLHttpError);
        } else {
          assert.deepEqual(await pending, { errors: [{ message: 'server failed' }] });
        }
        assert.equal(calls, 1);
        assert.equal(state.listeners.size, 0);
      }));
  }
});

describe('Native 초기 복구의 완료 경계', () => {
  it('저장 Profile 확인 전의 화면 성공이나 이전 actor의 성공으로 초기 복구를 종료하지 않는다', async () => {
    const state = appState();
    const recovery = new NativeStartupRecovery(state);
    const attempts = async () => {
      let calls = 0;
      await assert.rejects(
        recovery.execute(async () => {
          calls += 1;
          state.change('background');
          state.change('active');
          throw new TypeError('offline');
        }),
      );
      return calls;
    };
    recovery.complete();
    assert.equal(await attempts(), 2);
    recovery.changeActor();
    recovery.sessionReady();
    assert.equal(await attempts(), 2);
    recovery.complete();
    assert.equal(await attempts(), 1);
    recovery.changeActor();
    assert.equal(await attempts(), 1);
  });
});
