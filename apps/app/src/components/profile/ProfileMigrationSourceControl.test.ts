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
  hasMigrationSource: boolean | null | undefined;
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
  hasMigrationSource: false,
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
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 390 }),
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
    danger: '#a00',
    divider: '#ddd',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
  breakpoints: { compact: 768 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16, 24: 24 },
  textStyles: { uiCopyM: { fontSize: 14 }, uiLabelM: { fontSize: 14 } },
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
    hasMigrationSource: false,
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
    assert.equal(rendered('Button').length, 1);
    assert.equal(rendered('Button')[0].props.disabled, true);
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.',
      ),
      false,
    );

    await act(async () => input.props.onChangeText('  @source@remote.example  '));
    assert.equal(rendered('TextField')[0].props.value, '  @source@remote.example  ');
    assert.equal(rendered('Button')[0].props.disabled, false);

    await act(async () => rendered('Button')[0].props.onPress());
    assert.equal(rendered('Button')[0].props.loading, true);
    assert.equal(rendered('Button')[0].props.accessibilityState.busy, true);
    assert.deepEqual(
      rendered('Button').map((button) => button.props.accessibilityLabel),
      ['기존 계정 등록'],
    );
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
    profile.hasMigrationSource = true;
    await act(async () =>
      mutationConfigs[0].onCompleted({
        registerProfileMigrationSource: {
          profile: { id: profile.id },
        },
      }),
    );

    assert.equal(rendered('TextField').length, 0);
    assert.deepEqual(
      rendered('Button').map((button) => button.props.accessibilityLabel),
      ['기존 계정 등록 해제'],
    );
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.',
      ),
      true,
    );
    assert.equal(
      rendered('Text').filter((node) => node.children.join('') === '기존 계정을 등록했어요.')
        .length,
      1,
    );
    assert.equal(
      rendered('View').some(
        (node) => node.props.role === 'status' && node.props.accessibilityLiveRegion === 'polite',
      ),
      true,
    );
    assert.equal(
      rendered('Text').some(
        (node) => node.children.join('') === '이제 기존 서비스에서 아래 주소로 이전을 시작하세요.',
      ),
      true,
    );
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '@target@target-origin.example'),
      true,
    );
    assert.equal(
      rendered('View').some(
        (node) => node.props.accessibilityLabel === '등록한 계정 @source@remote.example',
      ),
      true,
    );
  });

  it('selected Instance 주소가 없으면 global origin 없이 주소 부재를 표시한다', async () => {
    profile.instance.canonicalOrigin = null;
    profile.hasMigrationSource = true;
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    assert.equal(
      rendered('View').some(
        (node) => node.props.accessibilityLabel === '이전할 Kosmo 프로필 주소를 확인할 수 없어요.',
      ),
      true,
    );
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '주소를 확인할 수 없어요.'),
      true,
    );
    assert.equal(rendered('TextField').length, 0);
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록 해제');
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
    profile.hasMigrationSource = true;
    await act(async () =>
      mutationConfigs[0].onCompleted(
        { registerProfileMigrationSource: { profile: { id: profile.id } } },
        [{ message: 'a non-fatal field failed' }],
      ),
    );

    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '기존 계정을 등록했어요.'),
      true,
    );

    await act(async () => rendered('Button')[0].props.onPress());
    assert.deepEqual(
      rendered('Button').map((button) => button.props.accessibilityLabel),
      ['기존 계정 등록 해제'],
    );
    profile.migrationSource = null;
    profile.hasMigrationSource = false;
    await act(async () =>
      mutationConfigs[1].onCompleted(
        { unregisterProfileMigrationSource: { profile: { id: profile.id } } },
        [{ message: 'a non-fatal field failed' }],
      ),
    );

    assert.equal(rendered('TextField')[0].props.value, '');
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록');
    assert.equal(rendered('Button').length, 1);
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.',
      ),
      false,
    );
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
    assert.deepEqual(
      rendered('Button').map((button) => button.props.accessibilityLabel),
      ['기존 계정 등록'],
    );
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
    const retry = rendered('Button').find(
      (node) => node.props.accessibilityLabel === '기존 계정 등록',
    );
    assert.ok(retry);
    await act(async () => retry?.props.onPress());
    assert.equal(mutationConfigs.length, 2);
    assert.equal(
      (mutationConfigs[1].variables.input as { sourceHandle: string }).sourceHandle,
      '@source@remote.example',
    );
  });

  it('Member는 입력과 원본 등록 action을 사용할 수 없다', async () => {
    profile.hasMigrationSource = null;
    await render(false);

    assert.equal(rendered('TextField')[0].props.editable, false);
    assert.equal(rendered('Button').length, 0);
    assert.equal(
      rendered('Text').some(
        (node) => node.children.join('') === '프로필 소유자만 원본을 변경할 수 있어요.',
      ),
      true,
    );
    assert.equal(
      rendered('Text').filter(
        (node) => node.children.join('') === '프로필 소유자만 원본을 변경할 수 있어요.',
      ).length,
      1,
    );
    assert.equal(
      rendered('Text').some((node) => node.props.accessibilityRole === 'alert'),
      false,
    );
  });

  it('Member는 준비된 원본도 해제할 수 없다', async () => {
    profile.hasMigrationSource = null;
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(false);

    assert.equal(rendered('TextField').length, 0);
    assert.equal(rendered('Button').length, 0);
    assert.equal(
      rendered('Text').filter(
        (node) => node.children.join('') === '프로필 소유자만 원본을 변경할 수 있어요.',
      ).length,
      1,
    );
  });

  it('이미 연결된 원본은 교체 입력 대신 등록 해제 action과 follower 안내를 제공한다', async () => {
    profile.hasMigrationSource = true;
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    assert.equal(rendered('TextField').length, 0);
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록 해제');
    assert.equal(rendered('Button').length, 1);
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.',
      ),
      true,
    );
  });

  it('Owner가 등록을 해제하면 null Profile 응답에서 빈 등록 form으로 돌아간다', async () => {
    profile.hasMigrationSource = true;
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
    assert.deepEqual(
      rendered('Button').map((button) => button.props.accessibilityLabel),
      ['기존 계정 등록 해제'],
    );

    profile.migrationSource = null;
    profile.hasMigrationSource = false;
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
    assert.equal(rendered('Button').length, 1);
    assert.equal(
      rendered('Text').some((node) => node.children.join('') === '등록한 계정'),
      false,
    );
  });

  it('등록 해제 실패는 원본을 유지하고 같은 작업을 재시도할 수 있다', async () => {
    profile.hasMigrationSource = true;
    profile.migrationSource = {
      displayName: '원격 원본',
      id: 'profile-source',
      relativeHandle: '@source@remote.example',
    };
    await render(true);

    await act(async () => rendered('Button')[0].props.onPress());
    await act(async () => mutationConfigs[0].onError(new Error('server detail')));

    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록 해제');
    assert.equal(rendered('Button').length, 1);
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.',
      ),
      true,
    );
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
    profile.hasMigrationSource = true;
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
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록 해제');
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
      rendered('Text').some((node) => node.children.join('') === '기존 계정을 등록했어요.'),
      false,
    );
  });

  it('원본 관계를 볼 수 없는 Owner도 등록을 해제하고 미등록 form으로 돌아간다', async () => {
    profile.hasMigrationSource = true;
    await render(true);

    assert.equal(rendered('TextField').length, 0);
    assert.deepEqual(
      rendered('Button').map((button) => button.props.accessibilityLabel),
      ['기존 계정 등록 해제'],
    );
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.children.join('') ===
          '등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.',
      ),
      true,
    );
    assert.equal(
      rendered('Text').some(
        (node) => node.children.join('') === '이제 기존 서비스에서 아래 주소로 이전을 시작하세요.',
      ),
      false,
    );

    await act(async () => rendered('Button')[0].props.onPress());
    profile.hasMigrationSource = false;
    await act(async () =>
      mutationConfigs[0].onCompleted({
        unregisterProfileMigrationSource: { profile: { id: profile.id } },
      }),
    );

    assert.equal(rendered('TextField')[0].props.value, '');
    assert.equal(rendered('Button')[0].props.accessibilityLabel, '기존 계정 등록');
    assert.equal(rendered('Button').length, 1);
  });

  it('Owner 등록 상태를 알 수 없으면 안내 오류만 표시하고 mutation action을 숨긴다', async () => {
    for (const [index, hasMigrationSource] of [null, undefined].entries()) {
      profile.hasMigrationSource = hasMigrationSource;
      await render(true, `owner-unknown-${index}`);

      const alert = rendered('Text').find((node) => node.props.accessibilityRole === 'alert');
      assert.equal(alert?.children.join(''), '이전 설정을 확인하지 못했어요.');
      assert.equal(rendered('Text').length, 1);
      assert.equal(rendered('TextField').length, 0);
      assert.equal(rendered('Button').length, 0);
      assert.equal(mutationConfigs.length, 0);

      assert.ok(renderer);
      await act(async () => renderer?.unmount());
      renderer = null;
    }
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
