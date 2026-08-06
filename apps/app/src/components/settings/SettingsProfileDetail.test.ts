import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, Fragment } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryData = {
  currentSession: {
    selectedProfile: {
      id: string;
      instance: { kind: 'ACTIVITYPUB' | 'LOCAL' };
    } | null;
  } | null;
  selectedProfileForEdit: { id: string } | null;
};

let queryData: QueryData;
let queryFetchKeys: unknown[] = [];
let routeBoundaryProps: Record<string, unknown> | null = null;
let openProfileSwitcherCalls = 0;
let relayActorRevision = 7;

mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    useLazyLoadQuery: (_query: unknown, _variables: unknown, options: { fetchKey?: unknown }) => {
      queryFetchKeys.push(options.fetchKey);
      return queryData;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../RouteBoundary.tsx', import.meta.url), {
  exports: {
    RouteBoundary: (props: Record<string, unknown> & { children: ReactNode }) => {
      routeBoundaryProps = props;
      return createElement(Fragment, null, props.children);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../profile/ProfileDefaultPostVisibilityControl.tsx', import.meta.url), {
  exports: {
    ProfileDefaultPostVisibilityControl: (props: Record<string, unknown>) =>
      createElement('ProfileDefaultPostVisibilityControl', props),
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
mock.module(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  exports: { useRelayActor: () => ({ revision: relayActorRevision }) },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsProfileDetail: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsProfileDetail } = await import('./SettingsProfileDetail'));
});

afterEach(async () => {
  queryData = { currentSession: { selectedProfile: null }, selectedProfileForEdit: null };
  queryFetchKeys = [];
  routeBoundaryProps = null;
  openProfileSwitcherCalls = 0;
  relayActorRevision = 7;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsProfileDetail', () => {
  it('selected Owner Profile을 편집 가능한 기존 control에 연결한다', async () => {
    const profile = { id: 'profile:owner', instance: { kind: 'LOCAL' as const } };
    queryData = {
      currentSession: { selectedProfile: profile },
      selectedProfileForEdit: { id: 'profile:owner' },
    };
    await render();

    const control = rendered('ProfileDefaultPostVisibilityControl')[0];
    assert.equal(control.props.profile, profile);
    assert.equal(control.props.editable, true);
    assert.equal(control.props.showTitle, false);
    assert.deepEqual(queryFetchKeys, ['7:0']);
  });

  it('selected Member Profile에는 같은 control을 읽기 전용으로 연결한다', async () => {
    const profile = { id: 'profile:member', instance: { kind: 'LOCAL' as const } };
    queryData = { currentSession: { selectedProfile: profile }, selectedProfileForEdit: null };
    await render();

    assert.equal(rendered('ProfileDefaultPostVisibilityControl')[0].props.editable, false);
  });

  it('selected Remote Profile에는 Local 공개 범위 control을 표시하지 않는다', async () => {
    queryData = {
      currentSession: {
        selectedProfile: {
          id: 'profile:remote',
          instance: { kind: 'ACTIVITYPUB' },
        },
      },
      selectedProfileForEdit: null,
    };
    await render();

    assert.equal(rendered('ProfileDefaultPostVisibilityControl').length, 0);
    assert.equal(rendered('StateView')[0].props.title, '설정할 Profile이 없어요');
  });

  it('selected Profile이 없으면 기존 Profile 선택 흐름을 연다', async () => {
    queryData = { currentSession: { selectedProfile: null }, selectedProfileForEdit: null };
    await render();

    const state = rendered('StateView')[0];
    assert.equal(state.props.title, '설정할 Profile이 없어요');
    assert.equal(state.props.actionLabel, 'Profile 선택하기');
    await act(async () => state.props.onAction());
    assert.equal(openProfileSwitcherCalls, 1);
  });

  it('Profile query loading/error/retry와 actor fetch identity를 detail 경계가 소유한다', async () => {
    queryData = { currentSession: { selectedProfile: null }, selectedProfileForEdit: null };
    await render();

    assert.ok(routeBoundaryProps);
    assert.equal(routeBoundaryProps.title, 'Profile 설정을 불러오지 못했어요');
    assert.ok(routeBoundaryProps.loading);
    await act(async () => (routeBoundaryProps?.onRetry as () => void)());
    assert.deepEqual(queryFetchKeys, ['7:0', '7:1']);
  });

  it('Relay actor가 바뀌면 새 actor identity로 Profile query를 다시 읽는다', async () => {
    queryData = { currentSession: { selectedProfile: null }, selectedProfileForEdit: null };
    await render();

    relayActorRevision = 8;
    assert.ok(renderer);
    await act(async () => renderer?.update(createElement(SettingsProfileDetail)));

    assert.deepEqual(queryFetchKeys, ['7:0', '8:0']);
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
