import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ImagePickerAsset, ImagePickerResult } from 'expo-image-picker';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileEditRoute as ProfileEditRouteExport } from './ProfileEditRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationConfig = {
  onCompleted: (response: never, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: Record<string, unknown>;
};

type ScreenProps = Record<string, unknown> & {
  onAvatarEdit: () => Promise<void>;
  onAvatarRetry: () => void;
  onChange: (value: Record<string, unknown>) => void;
  onHeaderEdit: () => Promise<void>;
  onSubmit: (value: Record<string, unknown>) => void;
  showTags: boolean;
  submitState: { kind: string };
  value: Record<string, unknown> & {
    avatar: { kind: string; uploadState?: string };
    header: { kind: string; uploadState?: string };
  };
};

const mutationCalls = new Map<string, MutationConfig[]>();
const mutationHandlers = new Map<string, (config: MutationConfig) => void>();
const routerReplacements: string[] = [];
let pickerResult: ImagePickerResult = { canceled: true, assets: null };
let queryData: {
  currentSession: { selectedProfile: { relativeHandle: string } | null } | null;
  selectedProfileForEdit: {
    avatar: { id: string; url: string | null } | null;
    bio: string | null;
    displayName: string;
    followPolicy: 'APPROVAL_REQUIRED' | 'OPEN';
    header: { id: string; url: string | null } | null;
    id: string;
    relativeHandle: string;
  } | null;
};
let renderer: ReactTestRenderer | null = null;
let screenProps: ScreenProps | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-image-picker', {
  launchImageLibraryAsync: async () => pickerResult,
});
mockModule('expo-router', {
  useRouter: () => ({ replace: (href: string) => routerReplacements.push(href) }),
});
mockModule('react-native', {
  Platform: { OS: 'web' },
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    const operation = parts.join('').match(/(?:query|mutation) (\w+)/)?.[1];
    assert.ok(operation);
    return operation;
  },
  useLazyLoadQuery: () => queryData,
  useMutation: (operation: string) => [
    (config: MutationConfig) => {
      const calls = mutationCalls.get(operation) ?? [];
      calls.push(config);
      mutationCalls.set(operation, calls);
      mutationHandlers.get(operation)?.(config);
    },
    false,
  ],
});
mockModule(new URL('./ProfileEditScreen.tsx', import.meta.url), {
  ProfileEditScreen: (props: ScreenProps) => {
    screenProps = props;
    return createElement('ProfileEditScreen');
  },
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let ProfileEditRoute: typeof ProfileEditRouteExport;

before(async () => {
  ({ ProfileEditRoute } = await import('./ProfileEditRoute'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mutationCalls.clear();
  mutationHandlers.clear();
  pickerResult = { canceled: true, assets: null };
  queryData = editableQueryData();
  routerReplacements.length = 0;
  screenProps = null;
  mock.restoreAll();
});

const editableQueryData = () => ({
  currentSession: { selectedProfile: { relativeHandle: '@owner' } },
  selectedProfileForEdit: {
    avatar: { id: 'media-avatar-current', url: 'https://media.example/avatar-current' },
    bio: '기존 소개',
    displayName: '기존 이름',
    followPolicy: 'OPEN' as const,
    header: { id: 'media-header-current', url: 'https://media.example/header-current' },
    id: 'profile-owner',
    relativeHandle: '@owner',
  },
});

const renderRoute = async () => {
  await act(async () => {
    renderer = create(createElement(ProfileEditRoute, { fetchKey: 'test' }));
  });
  assert.ok(renderer);
};

const requireScreenProps = () => {
  assert.ok(screenProps);
  return screenProps;
};

const asset = (uri: string): ImagePickerAsset => ({
  file: new File(['profile'], 'profile.webp', { type: 'image/webp' }),
  height: 100,
  mimeType: 'image/webp',
  uri,
  width: 100,
});

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('ProfileEditRoute', () => {
  it('편집 capability가 없으면 form 대신 Profile 복귀 상태를 표시한다', async () => {
    queryData = { ...editableQueryData(), selectedProfileForEdit: null };
    await renderRoute();

    const state = renderer!.root.findAll((node) => (node.type as unknown) === 'StateView')[0];
    assert.ok(state);
    assert.equal(state.props.title, '이 프로필을 수정할 수 없어요');
    assert.equal(state.props.actionLabel, '프로필로 돌아가기');
    await act(async () => state.props.onAction());
    assert.deepEqual(routerReplacements, ['/@owner']);
    assert.equal(screenProps, null);
  });

  it('server 초기값을 production form에 hydrate하고 Tag를 숨긴다', async () => {
    await renderRoute();

    const props = requireScreenProps();
    assert.equal(props.showTags, false);
    assert.deepEqual(props.value, {
      avatar: { kind: 'current', previewUri: 'https://media.example/avatar-current' },
      bio: '기존 소개',
      displayName: '기존 이름',
      followPolicy: 'OPEN',
      header: { kind: 'current', previewUri: 'https://media.example/header-current' },
      tags: [],
    });
    assert.equal(typeof props.onAvatarRemove, 'function');
    assert.equal(typeof props.onHeaderRetry, 'function');
  });

  it('부분 upload와 저장 실패를 field별로 재시도하며 Ready Media를 재업로드하지 않는다', async () => {
    let issued = 0;
    let completed = 0;
    let failAvatarCompletion = true;
    mutationHandlers.set('ProfileEditRouteIssueMediaUploadUrlMutation', (config) => {
      issued += 1;
      config.onCompleted({
        issueMediaUploadUrl: {
          media: { id: `media-issued-${issued}` },
          uploadUrl: `https://upload.example/${issued}`,
        },
      } as never);
    });
    mutationHandlers.set('ProfileEditRouteCompleteMediaUploadMutation', (config) => {
      completed += 1;
      if (failAvatarCompletion && completed === 2) {
        config.onError(new Error('avatar failed'));
        return;
      }
      config.onCompleted({ completeMediaUpload: { media: { state: 'READY' } } } as never);
    });
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () => new Response(null, { status: 204 }),
    );
    await renderRoute();

    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/header')] };
    await act(async () => requireScreenProps().onHeaderEdit());
    await flush();
    assert.equal(requireScreenProps().value.header.uploadState, 'ready');

    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/avatar')] };
    await act(async () => requireScreenProps().onAvatarEdit());
    await flush();
    assert.equal(requireScreenProps().value.avatar.uploadState, 'error');
    assert.equal(issued, 2);
    assert.equal(fetchMock.mock.callCount(), 2);

    failAvatarCompletion = false;
    await act(async () => requireScreenProps().onAvatarRetry());
    await flush();
    assert.equal(requireScreenProps().value.avatar.uploadState, 'ready');
    assert.equal(issued, 3);
    assert.equal(fetchMock.mock.callCount(), 3);

    const changed = {
      ...requireScreenProps().value,
      bio: ' 저장할 소개 ',
      displayName: '새 이름',
      followPolicy: 'APPROVAL_REQUIRED',
    };
    await act(async () => requireScreenProps().onChange(changed));
    let updateAttempts = 0;
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) => {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        config.onError(new Error('save failed'));
        return;
      }
      config.onCompleted({ updateProfile: { profile: { relativeHandle: '@updated' } } } as never);
    });

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(requireScreenProps().submitState.kind, 'error');
    assert.equal(issued, 3);
    const firstUpdate = mutationCalls.get('ProfileEditRouteUpdateProfileMutation')?.[0];
    assert.deepEqual(firstUpdate?.variables, {
      input: {
        avatarId: 'media-issued-3',
        bio: '저장할 소개',
        displayName: '새 이름',
        followPolicy: 'APPROVAL_REQUIRED',
        headerId: 'media-issued-1',
      },
    });
    assert.equal('tags' in ((firstUpdate?.variables.input as object | undefined) ?? {}), false);

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(issued, 3);
    assert.equal(fetchMock.mock.callCount(), 3);
    assert.deepEqual(routerReplacements, ['/@updated']);
  });
});
