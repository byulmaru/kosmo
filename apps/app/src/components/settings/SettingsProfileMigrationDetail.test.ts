import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Profile = {
  id: string;
  instance: { kind: 'ACTIVITYPUB' | 'LOCAL' };
  migrationSource?: unknown;
  viewerState: { membership: { role: 'MEMBER' | 'OWNER' } | null } | null;
};

type QueryData = { currentSession: { selectedProfile: Profile | null } | null };

let migrationEnabled = false;
let queryCalls = 0;
let openProfileSwitcherCalls = 0;
let queryData: QueryData = { currentSession: { selectedProfile: null } };

mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  exports: {
    graphql: () => ({}),
    useLazyLoadQuery: () => {
      queryCalls += 1;
      return queryData;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../FeatureFlagsContext.tsx', import.meta.url), {
  exports: { useFeatureFlag: (key: string) => key === 'profile-migration' && migrationEnabled },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../profile/ProfileMigrationSourceControl.tsx', import.meta.url), {
  exports: {
    ProfileMigrationSourceControl: (props: Record<string, unknown>) =>
      createElement('ProfileMigrationSourceControl', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../RouteBoundary.tsx', import.meta.url), {
  exports: {
    RouteBoundary: ({ children }: { children: ReactNode }) => children,
    useRouteBoundary: () => ({ fetchKey: 0 }),
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
  exports: { StateView: (props: Record<string, unknown>) => createElement('StateView', props) },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsProfileMigrationDetail: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsProfileMigrationDetail } = await import('./SettingsProfileMigrationDetail'));
});

afterEach(async () => {
  migrationEnabled = false;
  queryCalls = 0;
  openProfileSwitcherCalls = 0;
  queryData = { currentSession: { selectedProfile: null } };
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsProfileMigrationDetail', () => {
  it('feature flag가 꺼져 있거나 평가되지 않으면 query 없이 사용할 수 없는 설정을 표시한다', async () => {
    await render();

    assert.equal(queryCalls, 0);
    assert.equal(rendered('StateView')[0].props.title, '현재 이용할 수 없는 설정이에요');
    assert.equal(rendered('ProfileMigrationSourceControl').length, 0);
  });

  it('flag가 켜지면 선택된 Local Owner Profile을 기존 control에 연결한다', async () => {
    migrationEnabled = true;
    const profile: Profile = {
      id: 'profile:owner',
      instance: { kind: 'LOCAL' },
      migrationSource: null,
      viewerState: { membership: { role: 'OWNER' } },
    };
    queryData = { currentSession: { selectedProfile: profile } };
    await render();

    const migration = rendered('ProfileMigrationSourceControl')[0];
    assert.ok(migration);
    assert.equal(queryCalls, 1);
    assert.equal(migration.props.profile, profile);
    assert.equal(migration.props.editable, true);
  });

  it('Member는 기존 control을 읽기 전용으로 사용한다', async () => {
    migrationEnabled = true;
    const profile: Profile = {
      id: 'profile:member',
      instance: { kind: 'LOCAL' },
      migrationSource: null,
      viewerState: { membership: { role: 'MEMBER' } },
    };
    queryData = { currentSession: { selectedProfile: profile } };
    await render();

    assert.equal(rendered('ProfileMigrationSourceControl')[0].props.editable, false);
  });

  it('selected Profile이 없거나 Local이 아니면 기존 Profile 선택 state를 사용한다', async () => {
    migrationEnabled = true;
    queryData = {
      currentSession: {
        selectedProfile: {
          id: 'profile:remote',
          instance: { kind: 'ACTIVITYPUB' },
          viewerState: null,
        },
      },
    };
    await render();

    const state = rendered('StateView')[0];
    assert.equal(state.props.title, '설정할 Profile이 없어요');
    assert.equal(state.props.actionLabel, 'Profile 선택하기');
    await act(async () => state.props.onAction());
    assert.equal(openProfileSwitcherCalls, 1);
  });
});

async function render() {
  await act(async () => {
    renderer = create(createElement(SettingsProfileMigrationDetail));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
