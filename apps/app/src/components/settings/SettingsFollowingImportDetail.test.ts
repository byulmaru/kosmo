import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Profile = {
  displayName: string;
  relativeHandle: string;
  instance: { kind: 'ACTIVITYPUB' | 'LOCAL' };
  viewerState: { membership: { role: 'MEMBER' | 'OWNER' } | null } | null;
};

type QueryData = { currentSession: { selectedProfile: Profile | null } | null };
type MutationOptions = {
  variables: { input: { csv: string } };
  onCompleted?: (response: { importFollowingAccounts: { accepted: boolean } | null }) => void;
  onError?: (error: Error) => void;
};

let platform: 'android' | 'ios' | 'web' = 'web';
let migrationEnabled = false;
let queryCalls = 0;
let queryData: QueryData = { currentSession: { selectedProfile: null } };
let pickerCalls = 0;
const pickerOptions: Array<Record<string, unknown>> = [];
let pickerFailure = false;
let pickerResult: unknown;
let webFileSize = 12;
let nativeFileSize = 12;
let csvText = 'Account address\nuser@example.com';
let fileReadFailure = false;
let webFileReadCalls = 0;
let nativeFileReadCalls = 0;
const mutationCalls: MutationOptions[] = [];

mock.module('react-native', {
  exports: {
    Platform: {
      get OS() {
        return platform;
      },
    },
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
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
    useMutation: () => [(options: MutationOptions) => mutationCalls.push(options), false],
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../FeatureFlagsContext.tsx', import.meta.url), {
  exports: { useFeatureFlag: (key: string) => key === 'profile-migration' && migrationEnabled },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../profile/ProfileNameBlock.tsx', import.meta.url), {
  exports: {
    ProfileNameBlock: ({ profile }: { profile: unknown }) =>
      createElement('ProfileNameBlock', { profile }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../RouteBoundary.tsx', import.meta.url), {
  exports: {
    RouteBoundary: ({ children }: { children: ReactNode }) => children,
    useRouteBoundary: () => ({ fetchKey: 0 }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  exports: { useShellChrome: () => ({ openProfileSwitcher: () => undefined }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/Button.tsx', import.meta.url), {
  exports: {
    Button: ({ children, ...props }: Record<string, unknown>) =>
      createElement('Button', props, children as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/StateView.tsx', import.meta.url), {
  exports: { StateView: (props: Record<string, unknown>) => createElement('StateView', props) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      border: '#333333',
      card: '#eeeeee',
      danger: '#b42318',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-document-picker', {
  exports: {
    getDocumentAsync: (options: Record<string, unknown>) => {
      pickerCalls += 1;
      pickerOptions.push(options);
      return pickerFailure
        ? Promise.reject(new Error('picker failure'))
        : Promise.resolve(pickerResult);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-file-system', {
  exports: {
    File: class MockFile {
      get size() {
        return nativeFileSize;
      }

      async text() {
        nativeFileReadCalls += 1;
        if (fileReadFailure) {
          throw new Error('native file read failure');
        }
        return csvText;
      }
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsFollowingImportDetail: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsFollowingImportDetail } = await import('./SettingsFollowingImportDetail'));
});

afterEach(async () => {
  platform = 'web';
  migrationEnabled = false;
  queryCalls = 0;
  queryData = { currentSession: { selectedProfile: null } };
  pickerCalls = 0;
  pickerOptions.length = 0;
  pickerFailure = false;
  webFileSize = 12;
  pickerResult = webResult();
  nativeFileSize = 12;
  csvText = 'Account address\nuser@example.com';
  fileReadFailure = false;
  webFileReadCalls = 0;
  nativeFileReadCalls = 0;
  mutationCalls.length = 0;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsFollowingImportDetail', () => {
  it('direct route는 flag가 꺼져 있으면 query와 import control을 렌더링하지 않는다', async () => {
    await render();

    assert.equal(queryCalls, 0);
    assert.equal(mutationCalls.length, 0);
    assert.equal(rendered('StateView')[0]?.props.title, '현재 이용할 수 없는 설정이에요');
    assert.equal(rendered('Button').length, 0);
  });

  it('선택된 Local Member Profile을 표시하고 actor ID 없이 파일 내용을 전송한다', async () => {
    migrationEnabled = true;
    const profile: Profile = {
      displayName: '현재 Profile',
      relativeHandle: '@current',
      instance: { kind: 'LOCAL' },
      viewerState: { membership: { role: 'MEMBER' } },
    };
    queryData = { currentSession: { selectedProfile: profile } };
    await render();

    assert.equal(queryCalls, 1);
    assert.equal(rendered('ProfileNameBlock')[0]?.props.profile, profile);
    assert.equal(
      rendered('View').find((node) => node.props.role === 'group')?.props.accessibilityLabel,
      '팔로잉을 가져올 Profile 현재 Profile @current',
    );

    await press('CSV 파일 선택');
    assert.equal(pickerCalls, 1);
    assert.deepEqual(pickerOptions[0], {
      base64: false,
      copyToCacheDirectory: true,
      multiple: false,
    });
    assert.equal(webFileReadCalls, 1);
    assert.equal(button('이 Profile로 팔로잉 가져오기')?.props.disabled, false);
    assert.equal(textContent().includes('user@example.com'), false);

    await press('이 Profile로 팔로잉 가져오기');
    assert.deepEqual(mutationCalls[0]?.variables, {
      input: { csv: 'Account address\nuser@example.com' },
    });
    await act(async () => {
      mutationCalls[0]?.onCompleted?.({ importFollowingAccounts: { accepted: true } });
    });

    assert.match(textContent(), /팔로잉 가져오기를 시작했어요/);
    assert.equal(
      rendered('View').some((node) => node.props.accessibilityLiveRegion === 'polite'),
      true,
    );
    assert.equal(button('이 Profile로 팔로잉 가져오기')?.props.disabled, true);
  });

  it('파일 선택 취소는 안전하고 mutation을 보내지 않는다', async () => {
    migrationEnabled = true;
    queryData = { currentSession: { selectedProfile: localMember() } };
    pickerResult = { canceled: true, assets: null };
    await render();

    await press('CSV 파일 선택');

    assert.equal(pickerCalls, 1);
    assert.equal(webFileReadCalls, 0);
    assert.equal(mutationCalls.length, 0);
    assert.equal(button('이 Profile로 팔로잉 가져오기')?.props.disabled, true);
    assert.equal(
      rendered('Text').some((node) => node.props.accessibilityRole === 'alert'),
      false,
    );
  });

  it('512 KiB보다 큰 CSV는 읽거나 전송하지 않는다', async () => {
    migrationEnabled = true;
    queryData = { currentSession: { selectedProfile: localMember() } };
    webFileSize = 512 * 1024 + 1;
    pickerResult = webResult();
    await render();

    await press('CSV 파일 선택');

    assert.equal(webFileReadCalls, 0);
    assert.equal(mutationCalls.length, 0);
    assert.match(textContent(), /CSV 파일은 512 KiB 이하여야 해요/);
    assert.equal(
      rendered('Text').some((node) => node.props.accessibilityRole === 'alert'),
      true,
    );
  });

  it('파일 읽기 또는 picker 오류를 안전하게 안내하고 예외 원문을 숨긴다', async () => {
    migrationEnabled = true;
    queryData = { currentSession: { selectedProfile: localMember() } };
    fileReadFailure = true;
    await render();

    await press('CSV 파일 선택');

    assert.equal(mutationCalls.length, 0);
    assert.match(textContent(), /CSV 파일을 선택하거나 읽지 못했어요/);
    assert.equal(
      rendered('Text').some((node) => node.props.accessibilityRole === 'alert'),
      true,
    );
    assert.equal(textContent().includes('web file read failure'), false);

    fileReadFailure = false;
    pickerFailure = true;
    await press('CSV 파일 선택');

    assert.equal(pickerCalls, 2);
    assert.match(textContent(), /CSV 파일을 선택하거나 읽지 못했어요/);
    assert.equal(textContent().includes('picker failure'), false);
    assert.equal(mutationCalls.length, 0);
  });

  it('Android는 Expo File로 크기 제한을 확인하고 파일을 읽는다', async () => {
    platform = 'android';
    migrationEnabled = true;
    queryData = { currentSession: { selectedProfile: localMember() } };
    nativeFileSize = 512 * 1024 + 1;
    pickerResult = {
      canceled: false,
      assets: [{ name: 'following.csv', size: undefined, uri: 'file:///following.csv' }],
    };
    await render();

    await press('CSV 파일 선택');

    assert.equal(nativeFileReadCalls, 0);
    assert.equal(mutationCalls.length, 0);
    assert.match(textContent(), /CSV 파일은 512 KiB 이하여야 해요/);

    nativeFileSize = 12;
    await press('CSV 파일 선택');

    assert.equal(nativeFileReadCalls, 1);
    assert.equal(button('이 Profile로 팔로잉 가져오기')?.props.disabled, false);
  });

  it('ActivityPub Profile에는 import control을 제공하지 않는다', async () => {
    migrationEnabled = true;
    queryData = {
      currentSession: {
        selectedProfile: {
          ...localMember(),
          instance: { kind: 'ACTIVITYPUB' },
          viewerState: null,
        },
      },
    };
    await render();

    assert.equal(rendered('Button').length, 0);
    assert.equal(rendered('StateView')[0]?.props.title, '설정할 Profile이 없어요');
    assert.equal(pickerCalls, 0);
    assert.equal(mutationCalls.length, 0);
  });

  it('selected Local Profile의 멤버십이 없으면 import control을 제공하지 않는다', async () => {
    migrationEnabled = true;
    queryData = {
      currentSession: {
        selectedProfile: {
          ...localMember(),
          viewerState: { membership: null },
        },
      },
    };
    await render();

    assert.equal(rendered('Button').length, 0);
    assert.equal(
      rendered('StateView')[0]?.props.title,
      '이 Profile의 멤버만 팔로잉을 가져올 수 있어요.',
    );
    assert.equal(pickerCalls, 0);
    assert.equal(mutationCalls.length, 0);
  });

  it('mutation 오류는 안전한 한국어 상태를 표시한다', async () => {
    migrationEnabled = true;
    queryData = { currentSession: { selectedProfile: localMember() } };
    await render();
    await press('CSV 파일 선택');
    await press('이 Profile로 팔로잉 가져오기');

    await act(async () => {
      mutationCalls[0]?.onError?.(new Error('backend internals'));
    });

    assert.match(textContent(), /가져오기를 시작하지 못했어요/);
    assert.equal(textContent().includes('backend internals'), false);
    assert.equal(
      rendered('Text').some((node) => node.props.accessibilityRole === 'alert'),
      true,
    );
  });
});

async function render() {
  await act(async () => {
    renderer = create(createElement(SettingsFollowingImportDetail));
  });
  assert.ok(renderer);
}

async function press(label: string) {
  const target = button(label);
  assert.ok(target);
  await act(async () => {
    await target.props.onPress();
  });
}

function button(label: string): ReactTestInstance | undefined {
  return rendered('Button').find((node) => node.props.accessibilityLabel === label);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function textContent(): string {
  return rendered('Text')
    .map((node) => node.props.children)
    .filter((text): text is string => typeof text === 'string')
    .join(' ');
}

function localMember(): Profile {
  return {
    displayName: '현재 Profile',
    relativeHandle: '@current',
    instance: { kind: 'LOCAL' },
    viewerState: { membership: { role: 'MEMBER' } },
  };
}

function webResult() {
  return {
    canceled: false,
    assets: [
      {
        file: {
          get size() {
            return webFileSize;
          },
          async text() {
            webFileReadCalls += 1;
            if (fileReadFailure) {
              throw new Error('web file read failure');
            }
            return csvText;
          },
        },
        name: 'following.csv',
        mimeType: 'application/octet-stream',
        size: webFileSize,
        uri: 'blob:following.csv',
      },
    ],
  };
}
