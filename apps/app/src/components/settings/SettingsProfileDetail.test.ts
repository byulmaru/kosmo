import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryData = {
  currentSession: {
    selectedProfile: {
      displayName: string;
      followPolicy: 'APPROVAL_REQUIRED' | 'OPEN';
      id: string;
      instance: { kind: 'ACTIVITYPUB' | 'LOCAL' };
      private: { defaultPostVisibility: 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED' } | null;
      relativeHandle: string;
      viewerState: {
        membership: { role: 'MEMBER' | 'OWNER' } | null;
      } | null;
    } | null;
  } | null;
};

let queryData: QueryData;
let queryFetchKeys: unknown[] = [];
let openProfileSwitcherCalls = 0;
let queryMode: 'error' | 'success' = 'success';
let relayActorLifecycleKey = 'actor-a';
let mutationInFlight = false;
const mutationCalls: Array<Record<string, unknown>> = [];
let mutationConfigs: Array<{
  onCompleted: (response: never, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: Record<string, unknown>;
}> = [];

mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    useLazyLoadQuery: (_query: unknown, _variables: unknown, options: { fetchKey?: unknown }) => {
      queryFetchKeys.push(options.fetchKey);
      if (queryMode === 'error') {
        throw new Error('profile query failed');
      }
      return queryData;
    },
    useMutation: () => [
      (config: (typeof mutationConfigs)[number]) => {
        mutationCalls.push(config.variables);
        mutationConfigs.push(config);
      },
      mutationInFlight,
    ],
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./ProfileSettingsScreen.tsx', import.meta.url), {
  exports: {
    ProfileSettingsScreen: (props: Record<string, unknown>) =>
      createElement(
        'ProfileSettingsScreen',
        props,
        props.identityAction as ReactNode,
        props.children as ReactNode,
      ),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./ProfilePostingSettings.tsx', import.meta.url), {
  exports: {
    ProfilePostingSettings: (props: Record<string, unknown>) =>
      createElement('ProfilePostingSettings', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/Button.tsx', import.meta.url), {
  exports: {
    Button: ({ children, ...props }: Record<string, unknown>) =>
      createElement('Button', props, children as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  exports: {
    useShellChrome: () => ({
      openProfileSwitcher: () => {
        openProfileSwitcherCalls += 1;
      },
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/StateView.tsx', import.meta.url), {
  exports: {
    StateView: (props: Record<string, unknown>) => createElement('StateView', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  exports: { useUnexpectedErrorReporter: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  exports: { useRelayActorLifecycleKey: () => relayActorLifecycleKey },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({ feedbackDangerBase: '#b3261e', foregroundSecondary: '#666666' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
let SettingsProfileDetail: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsProfileDetail } = await import('./SettingsProfileDetail'));
});

afterEach(async () => {
  queryData = { currentSession: { selectedProfile: null } };
  queryFetchKeys = [];
  openProfileSwitcherCalls = 0;
  queryMode = 'success';
  relayActorLifecycleKey = 'actor-a';
  mutationInFlight = false;
  mutationCalls.length = 0;
  mutationConfigs = [];
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsProfileDetail', () => {
  it('selected Owner Profile은 변경한 scalar만 즉시 저장하고 pending 값을 표시한다', async () => {
    const profile = {
      displayName: 'Owner Profile',
      followPolicy: 'OPEN' as const,
      id: 'profile:owner',
      instance: { kind: 'LOCAL' as const },
      private: { defaultPostVisibility: 'PUBLIC' as const },
      relativeHandle: '@owner',
      viewerState: { membership: { role: 'OWNER' as const } },
    };
    queryData = {
      currentSession: { selectedProfile: profile },
    };
    await render();

    const screen = rendered('ProfileSettingsScreen')[0];
    assert.equal(screen.props.profile, profile);
    assert.equal(screen.props.embedded, true);
    assert.equal(rendered('ProfilePostingSettings')[0].props.editable, true);
    await act(async () =>
      rendered('Button')
        .find((node) => node.props.accessibilityLabel === '다른 Profile 선택')
        ?.props.onPress(),
    );
    assert.equal(openProfileSwitcherCalls, 1);
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'FOLLOWERS',
        followPolicy: 'OPEN',
      }),
    );
    assert.deepEqual(mutationCalls, [{ input: { defaultPostVisibility: 'FOLLOWERS' } }]);
    assert.deepEqual(rendered('ProfilePostingSettings')[0].props.value, {
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'OPEN',
    });

    mutationInFlight = true;
    await act(async () => renderer?.update(createElement(SettingsProfileDetail)));
    assert.equal(rendered('ProfilePostingSettings')[0].props.disabled, true);
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'UNLISTED',
        followPolicy: 'APPROVAL_REQUIRED',
      }),
    );
    assert.equal(mutationCalls.length, 1);

    mutationInFlight = false;
    await act(async () => {
      queryData = {
        currentSession: {
          selectedProfile: {
            ...profile,
            followPolicy: 'OPEN',
            private: { defaultPostVisibility: 'FOLLOWERS' },
          },
        },
      };
      mutationConfigs[0]!.onCompleted({
        updateProfile: {
          profile: {
            followPolicy: 'OPEN',
            private: { defaultPostVisibility: 'FOLLOWERS' },
          },
        },
      } as never);
      renderer?.update(createElement(SettingsProfileDetail));
    });
    assert.deepEqual(rendered('ProfilePostingSettings')[0].props.value, {
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'OPEN',
    });
    assert.deepEqual(queryFetchKeys, [0, 0, 0]);
  });

  it('저장 실패 뒤 마지막 저장값과 오류를 표시하고 다음 변경을 다시 저장한다', async () => {
    queryData = {
      currentSession: {
        selectedProfile: {
          displayName: 'Owner Profile',
          followPolicy: 'OPEN',
          id: 'profile:owner',
          instance: { kind: 'LOCAL' },
          private: { defaultPostVisibility: 'UNLISTED' },
          relativeHandle: '@owner',
          viewerState: { membership: { role: 'OWNER' } },
        },
      },
    };
    await render();
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'FOLLOWERS',
        followPolicy: 'APPROVAL_REQUIRED',
      }),
    );
    assert.deepEqual(mutationCalls, [
      { input: { defaultPostVisibility: 'FOLLOWERS', followPolicy: 'APPROVAL_REQUIRED' } },
    ]);
    mutationInFlight = true;
    await act(async () => renderer?.update(createElement(SettingsProfileDetail)));
    assert.equal(rendered('ProfilePostingSettings')[0].props.disabled, true);
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'PUBLIC',
        followPolicy: 'OPEN',
      }),
    );
    assert.equal(mutationCalls.length, 1);

    mutationInFlight = false;
    await act(async () => mutationConfigs[0]!.onError(new Error('save failed')));

    assert.deepEqual(rendered('ProfilePostingSettings')[0].props.value, {
      defaultPostVisibility: 'UNLISTED',
      followPolicy: 'OPEN',
    });
    assert.equal(
      rendered('Text').some(
        (node) => node.props.children === '설정을 저장하지 못했어요. 다시 변경해주세요.',
      ),
      true,
    );
    assert.equal(
      rendered('Button').some((node) => node.props.children === '다시 시도'),
      false,
    );
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'FOLLOWERS',
        followPolicy: 'OPEN',
      }),
    );
    assert.deepEqual(mutationCalls, [
      { input: { defaultPostVisibility: 'FOLLOWERS', followPolicy: 'APPROVAL_REQUIRED' } },
      { input: { defaultPostVisibility: 'FOLLOWERS' } },
    ]);
    assert.equal(
      rendered('Text').some(
        (node) => node.props.children === '설정을 저장하지 못했어요. 다시 변경해주세요.',
      ),
      false,
    );
  });

  it('selected Member Profile에는 같은 control을 읽기 전용으로 연결한다', async () => {
    const profile = {
      displayName: 'Member Profile',
      followPolicy: 'OPEN' as const,
      id: 'profile:member',
      instance: { kind: 'LOCAL' as const },
      private: { defaultPostVisibility: 'UNLISTED' as const },
      relativeHandle: '@member',
      viewerState: { membership: { role: 'MEMBER' as const } },
    };
    queryData = { currentSession: { selectedProfile: profile } };
    await render();

    assert.equal(rendered('ProfilePostingSettings')[0].props.editable, false);
    assert.equal(
      rendered('Button').some((node) => node.props.accessibilityLabel === '프로필 게시 설정 저장'),
      false,
    );
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'PUBLIC',
        followPolicy: 'APPROVAL_REQUIRED',
      }),
    );
    assert.equal(mutationCalls.length, 0);
  });

  it('same Profile의 권한 전환은 서버 baseline을 따르고 이전 draft를 복원하지 않는다', async () => {
    const profile = {
      displayName: 'Changing Profile',
      followPolicy: 'OPEN' as const,
      id: 'profile:changing',
      instance: { kind: 'LOCAL' as const },
      private: { defaultPostVisibility: 'PUBLIC' as const },
      relativeHandle: '@changing',
      viewerState: { membership: { role: 'OWNER' as const } },
    };
    queryData = { currentSession: { selectedProfile: profile } };
    await render();
    await act(async () =>
      rendered('ProfilePostingSettings')[0].props.onChange({
        defaultPostVisibility: 'FOLLOWERS',
        followPolicy: 'APPROVAL_REQUIRED',
      }),
    );

    queryData = {
      currentSession: {
        selectedProfile: {
          ...profile,
          followPolicy: 'APPROVAL_REQUIRED',
          private: { defaultPostVisibility: 'UNLISTED' },
          viewerState: { membership: { role: 'MEMBER' } },
        },
      },
    };
    await act(async () => renderer?.update(createElement(SettingsProfileDetail)));
    assert.equal(rendered('ProfilePostingSettings')[0].props.editable, false);
    assert.deepEqual(rendered('ProfilePostingSettings')[0].props.value, {
      defaultPostVisibility: 'UNLISTED',
      followPolicy: 'APPROVAL_REQUIRED',
    });

    queryData = { currentSession: { selectedProfile: profile } };
    await act(async () => renderer?.update(createElement(SettingsProfileDetail)));
    assert.equal(rendered('ProfilePostingSettings')[0].props.editable, true);
    assert.deepEqual(rendered('ProfilePostingSettings')[0].props.value, {
      defaultPostVisibility: 'PUBLIC',
      followPolicy: 'OPEN',
    });
  });

  it('selected Remote Profile에는 Local 공개 범위 control을 표시하지 않는다', async () => {
    queryData = {
      currentSession: {
        selectedProfile: {
          displayName: 'Remote Profile',
          followPolicy: 'OPEN',
          id: 'profile:remote',
          instance: { kind: 'ACTIVITYPUB' },
          private: null,
          relativeHandle: '@remote@example.com',
          viewerState: null,
        },
      },
    };
    await render();

    assert.equal(rendered('ProfilePostingSettings').length, 0);
    assert.equal(rendered('StateView')[0].props.title, '설정할 Profile이 없어요');
  });

  it('selected Profile이 없으면 기존 Profile 선택 흐름을 연다', async () => {
    queryData = { currentSession: { selectedProfile: null } };
    await render();

    const state = rendered('StateView')[0];
    assert.equal(state.props.title, '설정할 Profile이 없어요');
    assert.equal(state.props.actionLabel, 'Profile 선택하기');
    await act(async () => state.props.onAction());
    assert.equal(openProfileSwitcherCalls, 1);
  });

  it('production RouteBoundary가 manual retry와 actor lifecycle의 fetchKey를 소유한다', async () => {
    queryData = { currentSession: { selectedProfile: null } };
    queryMode = 'error';
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await render();

      const error = rendered('StateView')[0];
      assert.equal(error.props.title, 'Profile 설정을 불러오지 못했어요');
      assert.equal(error.props.actionLabel, '다시 시도');

      queryMode = 'success';
      await act(async () => error.props.onAction());
      assert.equal(queryFetchKeys[0], 0);
      assert.equal(queryFetchKeys.at(-1), 1);
      const queryCountAfterRetry = queryFetchKeys.length;

      relayActorLifecycleKey = 'actor-b';
      assert.ok(renderer);
      await act(async () => renderer?.update(createElement(SettingsProfileDetail)));

      assert.equal(queryFetchKeys.length, queryCountAfterRetry + 1);
      assert.equal(queryFetchKeys.at(-1), 1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

async function render() {
  await act(async () => {
    renderer = create(createElement(SettingsProfileDetail));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
