import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryMode = 'error' | 'loading' | 'success';

const pending = new Promise<never>(() => undefined);
const queryHistory: Array<{ fetchKey: string }> = [];
let queryMode: QueryMode = 'success';
let renderer: ReactTestRenderer | null = null;
let revision = 4;
let selectedProfileId: string | null = 'profile-a';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    assert.match(parts.join(''), /query SettingsPageQuery/);
    return 'SettingsPageQuery';
  },
  useLazyLoadQuery: (
    query: string,
    variables: Record<string, never>,
    options: { fetchKey: string },
  ) => {
    assert.equal(query, 'SettingsPageQuery');
    assert.deepEqual(variables, {});
    queryHistory.push({ fetchKey: options.fetchKey });

    if (queryMode === 'loading') {
      throw pending;
    }
    if (queryMode === 'error') {
      throw new Error('settings query failed');
    }

    return {
      currentSession: {
        id: 'session-a',
        selectedProfile: selectedProfileId ? { id: selectedProfileId } : null,
      },
    };
  },
});
mockModule(new URL('../../../components/settings/SettingsPage.tsx', import.meta.url), {
  SettingsPage: ({ profile }: { profile: { id: string } | null }) =>
    createElement('SettingsPage', { identity: profile?.id ?? 'empty' }),
});
mockModule(new URL('../../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActor: () => ({ revision }),
});
mockModule(new URL('../../../components/ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let SettingsScreen: ComponentType | null = null;

before(async () => {
  const module = await import('./settings').catch(() => null);
  SettingsScreen = module?.default ?? null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  queryHistory.length = 0;
  queryMode = 'success';
  revision = 4;
  selectedProfileId = 'profile-a';
});

async function renderScreen() {
  const Screen = SettingsScreen;
  assert.ok(Screen, 'SettingsScreen must exist');

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

describe('settings route Profile lifecycle', () => {
  it('현재 selected Profile을 canonical settings page에 전달한다', async () => {
    await renderScreen();

    assert.deepEqual(
      rendered('SettingsPage').map((node) => node.props.identity),
      ['profile-a'],
    );
    assert.equal(queryHistory.at(-1)?.fetchKey, '4:0');
  });

  it('selected Profile이 없어도 settings page의 empty state를 유지한다', async () => {
    selectedProfileId = null;
    await renderScreen();

    assert.deepEqual(
      rendered('SettingsPage').map((node) => node.props.identity),
      ['empty'],
    );
  });

  it('현재 settings query 오류를 재시도한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      const error = requireRendered('StateView');
      assert.equal(error.props.title, '설정 정보를 불러오지 못했어요');

      queryMode = 'success';
      await act(async () => error.props.onAction());

      assert.deepEqual(
        rendered('SettingsPage').map((node) => node.props.identity),
        ['profile-a'],
      );
      assert.equal(queryHistory.at(-1)?.fetchKey, '4:1');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('actor revision이 바뀌면 이전 Profile과 retry 상태를 재사용하지 않는다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      queryMode = 'success';
      await act(async () => requireRendered('StateView').props.onAction());

      revision = 5;
      selectedProfileId = 'profile-b';
      await renderScreen();

      assert.deepEqual(
        rendered('SettingsPage').map((node) => node.props.identity),
        ['profile-b'],
      );
      assert.equal(queryHistory.at(-1)?.fetchKey, '5:0');
    } finally {
      console.error = originalConsoleError;
    }
  });
});
