import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeLogoutFlow } from './logout-flow';
import type { LogoutFlowDependencies } from './logout-flow';

function createDependencies(
  runtime: LogoutFlowDependencies['runtime'],
  events: string[],
): LogoutFlowDependencies {
  return {
    clearNativeSession: async () => {
      events.push('clear-native-session');
    },
    replaceWithRoot: () => {
      events.push('replace-root');
    },
    requestNativeLogout: async () => {
      events.push('request-native-logout');
    },
    requestWebLogout: async () => {
      events.push('request-web-logout');
    },
    resetWebActor: () => {
      events.push('reset-web-actor');
    },
    runtime,
  };
}

describe('runtime logout flow', () => {
  it('Web은 server 성공 뒤 actor를 교체하고 root로 replace한다', async () => {
    const events: string[] = [];

    await executeLogoutFlow(createDependencies('web', events));

    assert.deepEqual(events, ['request-web-logout', 'reset-web-actor', 'replace-root']);
  });

  it('Native는 server 성공 뒤 SecureStore 경계를 정리하고 root로 replace한다', async () => {
    const events: string[] = [];

    await executeLogoutFlow(createDependencies('native', events));

    assert.deepEqual(events, ['request-native-logout', 'clear-native-session', 'replace-root']);
  });

  it('Web server 결과가 불명확하면 actor와 route를 유지한다', async () => {
    const events: string[] = [];
    const dependencies = createDependencies('web', events);
    dependencies.requestWebLogout = async () => {
      events.push('request-web-logout');
      throw new Error('network failure');
    };

    await assert.rejects(executeLogoutFlow(dependencies), /network failure/);

    assert.deepEqual(events, ['request-web-logout']);
  });

  it('Native server 결과가 불명확하면 credential과 route를 유지한다', async () => {
    const events: string[] = [];
    const dependencies = createDependencies('native', events);
    dependencies.requestNativeLogout = async () => {
      events.push('request-native-logout');
      throw new Error('GraphQL failure');
    };

    await assert.rejects(executeLogoutFlow(dependencies), /GraphQL failure/);

    assert.deepEqual(events, ['request-native-logout']);
  });

  it('Native credential 정리가 실패하면 완료 화면으로 이동하지 않는다', async () => {
    const events: string[] = [];
    const dependencies = createDependencies('native', events);
    dependencies.clearNativeSession = async () => {
      events.push('clear-native-session');
      throw new Error('SecureStore failure');
    };

    await assert.rejects(executeLogoutFlow(dependencies), /SecureStore failure/);

    assert.deepEqual(events, ['request-native-logout', 'clear-native-session']);
  });
});
