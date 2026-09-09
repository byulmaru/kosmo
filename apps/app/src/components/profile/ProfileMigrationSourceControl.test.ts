import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ProfileMigrationSourceControl as ProfileMigrationSourceControlExport } from './ProfileMigrationSourceControl';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Source = {
  displayName: string;
  id: string;
  relativeHandle: string;
};

type Profile = {
  displayName: string;
  id: string;
  migrationSource: Source | null;
  relativeHandle: string;
};

type MutationConfig = {
  onCompleted: (response: unknown, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: { input: { sourceHandle: string } };
};

let profile: Profile = {
  displayName: '현재 Profile',
  id: 'profile-target',
  migrationSource: null,
  relativeHandle: '@target',
};
let mutationConfigs: MutationConfig[] = [];
let environment = {};
let environmentGeneration = { current: 0 };

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: () => profile,
  useMutation: () => [
    (config: MutationConfig) => {
      mutationConfigs.push(config);
    },
  ],
  useRelayEnvironment: () => environment,
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: (props: Record<string, unknown>) =>
    createElement('Button', props, props.children as string),
});
mockModule(new URL('../ui/TextField.tsx', import.meta.url), {
  TextField: (props: Record<string, unknown>) => createElement('TextField', props),
});
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => environmentGeneration,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    card: '#fff',
    border: '#ddd',
    danger: '#a00',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  radii: { md: 8 },
  spacing: { lg: 16, md: 12 },
  typography: { lg: { fontSize: 20 }, md: { fontSize: 16 }, sm: { fontSize: 14 } },
});

let ProfileMigrationSourceControl: typeof ProfileMigrationSourceControlExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ProfileMigrationSourceControl } = await import('./ProfileMigrationSourceControl'));
});

afterEach(async () => {
  mutationConfigs = [];
  profile = {
    displayName: '현재 Profile',
    id: 'profile-target',
    migrationSource: null,
    relativeHandle: '@target',
  };
  environment = {};
  environmentGeneration = { current: 0 };
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('ProfileMigrationSourceControl', () => {
  it('Owner가 입력한 source handle을 등록하고 서버의 canonical source를 표시한다', async () => {
    await render(true);

    const input = rendered('TextField')[0];
    assert.equal(input.props.accessibilityLabel, '이전할 프로필 주소');
    assert.equal(input.props.value, '');
    assert.equal(rendered('Button')[0].props.disabled, true);

    await act(async () => input.props.onChangeText('  @source@remote.example  '));
    assert.equal(rendered('TextField')[0].props.value, '  @source@remote.example  ');
    assert.equal(rendered('Button')[0].props.disabled, false);

    await act(async () => rendered('Button')[0].props.onPress());
    assert.deepEqual(mutationConfigs[0].variables, {
      input: { sourceHandle: '@source@remote.example' },
    });
    assert.equal(rendered('Button')[0].props.loading, true);
    assert.equal(rendered('Button')[0].props.loadingText, '등록 중');

    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await act(async () =>
      mutationConfigs[0].onCompleted({
        registerProfileMigrationSource: {
          profile: { migrationSource: profile.migrationSource },
        },
      }),
    );

    assert.equal(rendered('Text')[0].children.join(''), '프로필 이전 원본');
    assert.equal(rendered('TextField').length, 0);
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '이전 원본을 등록했어요'),
      true,
    );
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') === '기존 Mastodon 계정에서 이 Kosmo 프로필로 이전을 실행하세요',
      ),
      true,
    );
    assert.equal(
      rendered('View').some(
        (node) =>
          node.props.accessibilityLabel === '현재 등록된 원본 원격 원본 @source@remote.example',
      ),
      true,
    );
  });

  it('빈 입력은 mutation 없이 검증 오류를 표시한다', async () => {
    await render(true);

    await act(async () => rendered('Button')[0].props.onPress());

    assert.equal(mutationConfigs.length, 0);
    assert.equal(rendered('TextField')[0].props.error, '이전할 프로필 주소를 입력해주세요.');
  });

  it('실패해도 입력을 보존하고 같은 값으로 재시도한다', async () => {
    await render(true);
    await act(async () => rendered('TextField')[0].props.onChangeText('@source@remote.example'));
    await act(async () => rendered('Button')[0].props.onPress());
    await act(async () => mutationConfigs[0].onError(new Error('server detail')));

    assert.equal(rendered('TextField')[0].props.value, '@source@remote.example');
    assert.equal(
      rendered('Text').some((node) => node.props.accessibilityRole === 'alert'),
      true,
    );
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.props.accessibilityRole === 'alert' &&
          node.children.join('') === '이전 원본을 등록하지 못했어요.',
      ),
      true,
    );
    const retry = rendered('Button').find((node) => node.props.children === '다시 시도');
    assert.ok(retry);
    await act(async () => retry?.props.onPress());
    assert.equal(mutationConfigs.length, 2);
    assert.equal(mutationConfigs[1].variables.input.sourceHandle, '@source@remote.example');
  });

  it('Member는 입력과 원본 등록 action을 사용할 수 없다', async () => {
    await render(false);

    assert.equal(rendered('TextField')[0].props.editable, false);
    assert.equal(rendered('Button').length, 0);
    assert.equal(
      rendered('Text').some(
        (node) => node.children.join('') === '프로필 소유자만 원본을 등록할 수 있어요.',
      ),
      true,
    );
  });

  it('이미 연결된 원본은 교체 입력이나 원본 등록 action을 제공하지 않는다', async () => {
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    assert.equal(rendered('TextField').length, 0);
    assert.equal(rendered('Button').length, 0);
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '등록된 원본은 교체할 수 없어요.'),
      true,
    );
  });

  it('환경 세대가 바뀐 뒤 이전 등록 mutation의 완료를 반영하지 않는다', async () => {
    await render(true);
    await act(async () => rendered('TextField')[0].props.onChangeText('@source@remote.example'));
    await act(async () => rendered('Button')[0].props.onPress());
    const staleCompletion = mutationConfigs[0].onCompleted;

    environmentGeneration.current = 1;
    assert.ok(renderer);
    await act(async () =>
      renderer?.update(
        createElement(ProfileMigrationSourceControl, { editable: true, profile: {} as never }),
      ),
    );
    await act(async () =>
      staleCompletion({
        registerProfileMigrationSource: {
          profile: {
            migrationSource: {
              displayName: '늦은 원본',
              id: 'profile-stale-source',
              relativeHandle: '@stale@remote.example',
            },
          },
        },
      }),
    );

    assert.equal(rendered('TextField')[0].props.value, '');
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '이전 원본을 등록했어요'),
      false,
    );
  });
});

async function render(editable: boolean) {
  await act(async () => {
    renderer = create(
      createElement(ProfileMigrationSourceControl, { editable, profile: {} as never }),
    );
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
