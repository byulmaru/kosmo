import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryMode = 'error' | 'loading' | 'success';

const pending = new Promise<never>(() => undefined);
const queryHistory: Array<{ fetchKey: number }> = [];
let queryMode: QueryMode = 'success';
let renderer: ReactTestRenderer | null = null;
let selectedProfileId: string | null = 'profile-a';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    assert.match(parts.join(''), /query FollowRequestsPageQuery/);
    return 'FollowRequestsPageQuery';
  },
  useLazyLoadQuery: (
    query: string,
    variables: Record<string, never>,
    options: { fetchKey: number },
  ) => {
    assert.equal(query, 'FollowRequestsPageQuery');
    assert.deepEqual(variables, {});
    queryHistory.push({ fetchKey: options.fetchKey });

    if (queryMode === 'loading') {
      throw pending;
    }
    if (queryMode === 'error') {
      throw new Error('follow requests query failed');
    }

    return {
      currentSession: {
        id: 'session-a',
        selectedProfile: selectedProfileId ? { id: selectedProfileId } : null,
      },
    };
  },
});
mockModule(new URL('./FollowRequestList.tsx', import.meta.url), {
  FollowRequestList: ({ profile }: { profile: { id: string } }) =>
    createElement('FollowRequestList', { identity: profile.id }),
  FollowRequestListState: ({ onRetry, state }: { onRetry?: () => void; state: string }) =>
    createElement('FollowRequestListState', { onRetry, state }),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => 'actor-a',
  useRelayActor: () => ({ resetActor: () => undefined }),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let FollowRequestsScreen: ComponentType | null = null;

before(async () => {
  const module = await import('../../app/(tabs)/(protected)/follow-requests').catch(() => null);
  FollowRequestsScreen = module?.default ?? null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  queryHistory.length = 0;
  queryMode = 'success';
  selectedProfileId = 'profile-a';
});

async function renderScreen() {
  const Screen = FollowRequestsScreen;
  assert.ok(Screen, 'FollowRequestsScreen must exist');

  await act(async () => {
    if (renderer) {
      renderer.update(createElement(Screen));
    } else {
      renderer = create(createElement(Screen));
    }
  });
  assert.ok(renderer);
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function requireRendered(type: string) {
  const node = rendered(type)[0];
  assert.ok(node);
  return node;
}

describe('follow requests route actor lifecycle', () => {
  it('현재 selected Profile fragment만 목록에 전달한다', async () => {
    await renderScreen();

    assert.deepEqual(
      rendered('FollowRequestList').map((node) => node.props.identity),
      ['profile-a'],
    );
    assert.equal(queryHistory.at(-1)?.fetchKey, 0);
  });

  it('selected Profile이 없으면 profile-required 상태를 표시한다', async () => {
    selectedProfileId = null;
    await renderScreen();

    assert.equal(requireRendered('FollowRequestListState').props.state, 'profileRequired');
    assert.deepEqual(rendered('FollowRequestList'), []);
  });

  it('현재 actor query error를 재시도한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      const error = requireRendered('FollowRequestListState');
      assert.equal(error.props.state, 'error');

      queryMode = 'success';
      await act(async () => error.props.onRetry());

      assert.deepEqual(
        rendered('FollowRequestList').map((node) => node.props.identity),
        ['profile-a'],
      );
      assert.equal(queryHistory.at(-1)?.fetchKey, 1);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('route boundary를 새로 만들면 retry key와 이전 Profile 표시를 재사용하지 않는다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      queryMode = 'success';
      await act(async () => requireRendered('FollowRequestListState').props.onRetry());
      assert.equal(queryHistory.at(-1)?.fetchKey, 1);

      selectedProfileId = 'profile-b';
      await act(async () => renderer?.unmount());
      renderer = null;
      await renderScreen();

      assert.deepEqual(
        rendered('FollowRequestList').map((node) => node.props.identity),
        ['profile-b'],
      );
      assert.equal(queryHistory.at(-1)?.fetchKey, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
