import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
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
  handle: string;
  id: string;
  instance: { canonicalOrigin: string | null };
  migrationSource: Source | null;
  relativeHandle: string;
};

type MutationConfig = {
  operationName: string;
  onCompleted: (response: unknown, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: Record<string, unknown>;
};

let profile: Profile = {
  displayName: '현재 Profile',
  handle: 'target',
  id: 'profile-target',
  instance: { canonicalOrigin: 'https://target-origin.example' },
  migrationSource: null,
  relativeHandle: '@target',
};
let mutationConfigs: MutationConfig[] = [];

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
  graphql: (strings: TemplateStringsArray) =>
    strings.join('').match(/\bmutation\s+(\w+)/)?.[1] ?? 'fragment',
  useFragment: () => profile,
  useMutation: (operationName: string) => {
    const [isInFlight, setIsInFlight] = useState(false);
    return [
      (config: MutationConfig) => {
        mutationConfigs.push({
          ...config,
          onCompleted: (response, errors) => {
            setIsInFlight(false);
            config.onCompleted(response, errors);
          },
          onError: (error) => {
            setIsInFlight(false);
            config.onError(error);
          },
          operationName,
        });
        setIsInFlight(true);
      },
      isInFlight,
    ];
  },
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: (props: Record<string, unknown>) =>
    createElement('Button', props, props.children as string),
});
mockModule(new URL('../ui/TextField.tsx', import.meta.url), {
  TextField: (props: Record<string, unknown>) => createElement('TextField', props),
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
    handle: 'target',
    id: 'profile-target',
    instance: { canonicalOrigin: 'https://target-origin.example' },
    migrationSource: null,
    relativeHandle: '@target',
  };
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('ProfileMigrationSourceControl', () => {
  it('Owner가 기존 계정을 등록하고 선택된 Profile의 qualified destination 주소를 보여준다', async () => {
    await render(true);

    const input = rendered('TextField')[0];
    assert.equal(input.props.accessibilityLabel, '기존 계정 주소');
    assert.equal(input.props.value, '');
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록');
    assert.equal(rendered('Button')[0].props.disabled, true);
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '기존 계정 주소를 먼저 등록한 뒤 기존 서비스에서 이 Kosmo 프로필로 Move를 시작하세요. 팔로워는 옮길 수 있지만 게시물은 복사되지 않아요.',
      ),
      true,
    );
    assert.equal(
      rendered('View').some(
        (node) =>
          node.props.accessibilityLabel ===
          '이전받을 Kosmo 프로필 현재 Profile @target@target-origin.example',
      ),
      true,
    );

    await act(async () => input.props.onChangeText('  @source@remote.example  '));
    assert.equal(rendered('TextField')[0].props.value, '  @source@remote.example  ');
    assert.equal(rendered('Button')[0].props.disabled, false);

    await act(async () => rendered('Button')[0].props.onPress());
    assert.equal(mutationConfigs[0].operationName, 'ProfileMigrationSourceControlMutation');
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
          profile: { id: profile.id },
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
          node.children.join('') ===
          '이제 기존 서비스의 계정에서 이 Kosmo 프로필로 Move를 시작하세요.',
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

  it('selected Instance 주소가 없으면 global origin 없이 주소 부재를 표시한다', async () => {
    profile.instance.canonicalOrigin = null;
    await render(true);

    assert.equal(
      rendered('View').some(
        (node) => node.props.accessibilityLabel === '이전받을 Kosmo 프로필 현재 Profile',
      ),
      true,
    );
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '주소를 확인할 수 없어요.'),
      true,
    );
    assert.equal(rendered('TextField')[0].props.accessibilityLabel, '기존 계정 주소');
  });

  it('부분 GraphQL errors가 있어도 같은 Profile ID의 등록 및 해제 payload를 성공으로 처리한다', async () => {
    await render(true);
    await act(async () => rendered('TextField')[0].props.onChangeText('@source@remote.example'));
    await act(async () => rendered('Button')[0].props.onPress());
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await act(async () =>
      mutationConfigs[0].onCompleted(
        { registerProfileMigrationSource: { profile: { id: profile.id } } },
        [{ message: 'a non-fatal field failed' }],
      ),
    );

    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '이전 원본을 등록했어요'),
      true,
    );

    await act(async () => rendered('Button')[0].props.onPress());
    profile.migrationSource = null;
    await act(async () =>
      mutationConfigs[1].onCompleted(
        { unregisterProfileMigrationSource: { profile: { id: profile.id } } },
        [{ message: 'a non-fatal field failed' }],
      ),
    );

    assert.equal(rendered('TextField')[0].props.value, '');
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록');
  });

  it('빈 입력은 mutation 없이 검증 오류를 표시한다', async () => {
    await render(true);

    await act(async () => rendered('Button')[0].props.onPress());

    assert.equal(mutationConfigs.length, 0);
    assert.equal(rendered('TextField')[0].props.error, '기존 계정 주소를 입력해주세요.');
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
    assert.equal(
      (mutationConfigs[1].variables.input as { sourceHandle: string }).sourceHandle,
      '@source@remote.example',
    );
  });

  it('Member는 입력과 원본 등록 action을 사용할 수 없다', async () => {
    await render(false);

    assert.equal(rendered('TextField')[0].props.editable, false);
    assert.equal(rendered('Button').length, 0);
    assert.equal(
      rendered('Text').some(
        (node) => node.children.join('') === '프로필 소유자만 원본을 변경할 수 있어요.',
      ),
      true,
    );
  });

  it('이미 연결된 원본은 교체 입력 대신 등록 해제 action과 follower 안내를 제공한다', async () => {
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    assert.equal(rendered('TextField').length, 0);
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록 해제');
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록 해제 후 남은 팔로워 이전은 중단될 수 있어요. 이미 이전된 팔로워는 그대로 유지돼요.',
      ),
      true,
    );
  });

  it('Owner가 등록을 해제하면 null Profile 응답에서 빈 등록 form으로 돌아간다', async () => {
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    const unregister = rendered('Button')[0];
    await act(async () => unregister.props.onPress());
    assert.equal(
      mutationConfigs[0].operationName,
      'ProfileMigrationSourceControlUnregisterMutation',
    );
    assert.deepEqual(mutationConfigs[0].variables, {});
    assert.equal(rendered('Button')[0].props.loading, true);

    profile.migrationSource = null;
    await act(async () =>
      mutationConfigs[0].onCompleted({
        unregisterProfileMigrationSource: {
          profile: { id: profile.id },
        },
      }),
    );

    assert.equal(rendered('TextField')[0].props.accessibilityLabel, '기존 계정 주소');
    assert.equal(rendered('TextField')[0].props.value, '');
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록');
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '현재 등록된 원본'),
      false,
    );
  });

  it('등록 해제 실패는 원본을 유지하고 같은 작업을 재시도할 수 있다', async () => {
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    await act(async () => rendered('Button')[0].props.onPress());
    await act(async () => mutationConfigs[0].onError(new Error('server detail')));

    assert.equal(rendered('Button')[0].props.accessibilityLabel, '다시 시도');
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.props.accessibilityRole === 'alert' &&
          node.children.join('') === '기존 계정 등록을 해제하지 못했어요.',
      ),
      true,
    );
    await act(async () => rendered('Button')[0].props.onPress());
    assert.deepEqual(mutationConfigs[1].variables, {});
    assert.equal(profile.migrationSource?.relativeHandle, '@source@remote.example');
  });

  it('unregister 성공 응답에 다른 Profile ID가 오면 원본 등록 해제 완료로 처리하지 않는다', async () => {
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    await act(async () => rendered('Button')[0].props.onPress());
    await act(async () =>
      mutationConfigs[0].onCompleted({
        unregisterProfileMigrationSource: { profile: { id: 'another-profile' } },
      }),
    );

    assert.equal(rendered('TextField').length, 0);
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '다시 시도');
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.props.accessibilityRole === 'alert' &&
          node.children.join('') === '기존 계정 등록을 해제하지 못했어요.',
      ),
      true,
    );
  });

  it('actor boundary remount 뒤 이전 등록 mutation의 완료는 새 actor 화면에 반영되지 않는다', async () => {
    await render(true, 'actor-a');
    await act(async () => rendered('TextField')[0].props.onChangeText('@source@remote.example'));
    await act(async () => rendered('Button')[0].props.onPress());
    const staleCompletion = mutationConfigs[0].onCompleted;

    assert.ok(renderer);
    await act(async () =>
      renderer?.update(
        createElement(ProfileMigrationSourceControl, {
          editable: true,
          key: 'actor-b',
          profile: {} as never,
        }),
      ),
    );
    await act(async () =>
      staleCompletion({
        registerProfileMigrationSource: {
          profile: {
            id: 'profile-target',
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

async function render(editable: boolean, actorLifecycleKey = 'actor-a') {
  await act(async () => {
    renderer = create(
      createElement(ProfileMigrationSourceControl, {
        editable,
        key: actorLifecycleKey,
        profile: {} as never,
      }),
    );
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
