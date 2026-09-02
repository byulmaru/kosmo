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
  initialValue: Record<string, unknown> & {
    followPolicy: 'APPROVAL_REQUIRED' | 'OPEN';
    tags: ReadonlyArray<string>;
  };
  onAvatarEdit: () => Promise<void>;
  onAvatarRetry: () => void;
  onBack: () => void;
  onChange: (value: Record<string, unknown>) => void;
  onHeaderEdit: () => Promise<void>;
  onSubmit: (value: Record<string, unknown>) => void;
  serverErrors?: { tags?: string };
  showTags: boolean;
  submitState: { kind: string };
  value: Record<string, unknown> & {
    avatar: { kind: string; failure?: unknown; uploadState?: string };
    header: { kind: string; failure?: unknown; uploadState?: string };
    tags: ReadonlyArray<string>;
  };
};

type NavigationAction = {
  readonly source: string;
  readonly target?: string;
  readonly type: string;
};
type BeforeRemoveEvent = {
  readonly data: { readonly action: NavigationAction };
  readonly preventDefault: ReturnType<typeof mock.fn>;
};
type DiscardDialogProps = {
  onContinue: () => void;
  onDiscard: () => void;
  visible: boolean;
};

const mutationCalls = new Map<string, MutationConfig[]>();
const mutationHandlers = new Map<string, (config: MutationConfig) => void>();
const navigationDispatches: NavigationAction[] = [];
const routerReplacements: string[] = [];
const toastMessages: string[] = [];
let preventRemoveCallback: ((options: { data: { action: NavigationAction } }) => void) | null =
  null;
let preventRemoveEnabled = false;
let discardDialogProps: DiscardDialogProps | null = null;
let lastBackEvent: BeforeRemoveEvent | null = null;
let lastReplaceEvent: BeforeRemoveEvent | null = null;
let pickerResult: ImagePickerResult = { canceled: true, assets: null };
let routerBackCalls = 0;
let routerCanGoBack = true;
let triggerBeforeRemoveOnReplace = false;
let deferBeforeRemoveOnReplace = false;
let pendingReplaceCompletion: (() => void) | null = null;
let noOpReplace = false;
let throwOnReplace = false;
type EditableQueryProfile = {
  avatar: { id: string; url: string | null } | null;
  bio: string | null;
  displayName: string;
  followPolicy: 'APPROVAL_REQUIRED' | 'OPEN';
  header: { id: string; url: string | null } | null;
  id: string;
  instance: { kind: 'ACTIVITYPUB' | 'LOCAL' };
  relativeHandle: string;
  tags: ReadonlyArray<{ id: string; name: string }>;
  viewerState: { membership: { role: 'MEMBER' | 'OWNER' } | null } | null;
};
let queryData: {
  currentSession: { selectedProfile: EditableQueryProfile | null } | null;
};
let renderer: ReactTestRenderer | null = null;
let screenProps: ScreenProps | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const normalizedImageUri = 'file:///cache/profile-normalized.webp';

mockModule('expo-image-picker', {
  launchImageLibraryAsync: async () => pickerResult,
});
const mockImageManipulator = () =>
  mockModule('expo-image-manipulator', {
    ImageManipulator: {
      manipulate: () => {
        const image = {
          height: 100,
          release: () => undefined,
          saveAsync: async () => ({
            height: 100,
            uri: normalizedImageUri,
            width: 100,
          }),
          uri: 'file:///cache/profile-rendered.png',
          width: 100,
        };
        const context: {
          release: () => void;
          renderAsync: () => Promise<typeof image>;
          resize: () => typeof context;
        } = {
          release: () => undefined,
          renderAsync: async () => image,
          resize: () => context,
        };
        return context;
      },
    },
    SaveFormat: { WEBP: 'webp' },
  });
mockImageManipulator();
mockModule('expo-router', {
  useNavigation: () => ({
    dispatch: (action: NavigationAction) => navigationDispatches.push(action),
  }),
  useRouter: () => ({
    back: () => {
      routerBackCalls += 1;
      lastBackEvent = emitBeforeRemove({ source: 'route-action', type: 'GO_BACK' });
    },
    canGoBack: () => routerCanGoBack,
    replace: (href: string) => {
      if (throwOnReplace) {
        throw new Error('replace failed');
      }
      if (triggerBeforeRemoveOnReplace) {
        const completeReplace = () => {
          lastReplaceEvent = emitBeforeRemove({ source: 'save-success', type: 'REPLACE' });
          if (lastReplaceEvent.preventDefault.mock.callCount() > 0) {
            return;
          }
          if (!noOpReplace) {
            routerReplacements.push(href);
          }
        };
        if (deferBeforeRemoveOnReplace) {
          assert.equal(pendingReplaceCompletion, null);
          pendingReplaceCompletion = completeReplace;
          return;
        }
        completeReplace();
        return;
      }
      if (!noOpReplace) {
        routerReplacements.push(href);
      }
    },
  }),
});
mockModule('expo-router/react-navigation', {
  usePreventRemove: (
    enabled: boolean,
    callback: (options: { data: { action: NavigationAction } }) => void,
  ) => {
    preventRemoveEnabled = enabled;
    preventRemoveCallback = callback;
  },
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
mockModule(new URL('./ProfileEditDiscardDialog.tsx', import.meta.url), {
  ProfileEditDiscardDialog: (props: DiscardDialogProps) => {
    discardDialogProps = props;
    return createElement('ProfileEditDiscardDialog');
  },
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({ showToast: (message: string) => toastMessages.push(message) }),
});

let ProfileEditRoute: typeof ProfileEditRouteExport;

before(async () => {
  await import('expo-image-manipulator');
  ({ ProfileEditRoute } = await import('./ProfileEditRoute'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mutationCalls.clear();
  mutationHandlers.clear();
  navigationDispatches.length = 0;
  pickerResult = { canceled: true, assets: null };
  queryData = editableQueryData();
  preventRemoveCallback = null;
  preventRemoveEnabled = false;
  discardDialogProps = null;
  lastBackEvent = null;
  lastReplaceEvent = null;
  routerReplacements.length = 0;
  routerBackCalls = 0;
  routerCanGoBack = true;
  screenProps = null;
  toastMessages.length = 0;
  triggerBeforeRemoveOnReplace = false;
  deferBeforeRemoveOnReplace = false;
  pendingReplaceCompletion = null;
  noOpReplace = false;
  throwOnReplace = false;
  mock.restoreAll();
  mockImageManipulator();
});

const editableQueryData = () => ({
  currentSession: {
    selectedProfile: {
      avatar: { id: 'media-avatar-current', url: 'https://media.example/avatar-current' },
      bio: '기존 소개',
      displayName: '기존 이름',
      followPolicy: 'OPEN' as const,
      header: { id: 'media-header-current', url: 'https://media.example/header-current' },
      id: 'profile-owner',
      instance: { kind: 'LOCAL' as const },
      relativeHandle: '@owner',
      tags: [
        { id: 'hashtag-fediverse', name: 'Fediverse' },
        { id: 'hashtag-development', name: '개발' },
      ],
      viewerState: { membership: { role: 'OWNER' as const } },
    },
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

const requireDiscardDialogProps = () => {
  assert.ok(discardDialogProps);
  return discardDialogProps;
};

function emitBeforeRemove(action: NavigationAction): BeforeRemoveEvent {
  const event: BeforeRemoveEvent = {
    data: { action },
    preventDefault: mock.fn(),
  };
  if (preventRemoveEnabled) {
    assert.ok(preventRemoveCallback);
    event.preventDefault();
    preventRemoveCallback({ data: { action } });
  }
  return event;
}

function requireBeforeRemoveEvent(event: BeforeRemoveEvent | null): BeforeRemoveEvent {
  assert.ok(event);
  return event;
}

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

const mockSuccessfulUploadFetch = () =>
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === normalizedImageUri) {
      return new Response(new Blob(['normalized-webp'], { type: 'image/webp' }), { status: 200 });
    }
    assert.equal(init?.method, 'PUT');
    assert.deepEqual(init?.headers, { 'content-type': 'image/webp' });
    assert.equal((init?.body as Blob).type, 'image/webp');
    return new Response(null, { status: 204 });
  });

const completeDeferredReplace = async () => {
  const completeReplace = pendingReplaceCompletion;
  assert.ok(completeReplace);
  pendingReplaceCompletion = null;
  await act(async () => completeReplace());
};

describe('ProfileEditRoute', () => {
  it('selected Profile이 Member, 무관, Remote 또는 unavailable이면 복귀 상태를 표시한다', async () => {
    const data = editableQueryData();
    const owner = data.currentSession.selectedProfile;
    const scenarios: Array<{
      expectedReturn: string;
      selectedProfile: EditableQueryProfile | null;
    }> = [
      {
        expectedReturn: '/@owner',
        selectedProfile: {
          ...owner,
          viewerState: { membership: { role: 'MEMBER' } },
        },
      },
      {
        expectedReturn: '/@owner',
        selectedProfile: { ...owner, viewerState: { membership: null } },
      },
      {
        expectedReturn: '/@owner',
        selectedProfile: { ...owner, instance: { kind: 'ACTIVITYPUB' } },
      },
      { expectedReturn: '/', selectedProfile: null },
    ];

    for (const scenario of scenarios) {
      queryData = { currentSession: { selectedProfile: scenario.selectedProfile } };
      await renderRoute();

      const state = renderer!.root.findAll((node) => (node.type as unknown) === 'StateView')[0];
      assert.ok(state);
      assert.equal(state.props.title, '이 프로필을 수정할 수 없어요');
      assert.equal(state.props.actionLabel, '프로필로 돌아가기');
      await act(async () => state.props.onAction());
      assert.deepEqual(routerReplacements, [scenario.expectedReturn]);
      assert.equal(screenProps, null);

      await act(async () => renderer?.unmount());
      renderer = null;
      routerReplacements.length = 0;
    }
  });

  it('server Profile Tag를 production form에 hydrate하고 editor를 보인다', async () => {
    await renderRoute();

    const props = requireScreenProps();
    assert.equal(props.showTags, true);
    assert.deepEqual(props.value, {
      avatar: { kind: 'current', previewUri: 'https://media.example/avatar-current' },
      bio: '기존 소개',
      displayName: '기존 이름',
      followPolicy: 'OPEN',
      header: { kind: 'current', previewUri: 'https://media.example/header-current' },
      tags: ['Fediverse', '개발'],
    });
    assert.deepEqual(props.initialValue.tags, ['Fediverse', '개발']);
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
    const fetchMock = mockSuccessfulUploadFetch();
    await renderRoute();

    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/header')] };
    await act(async () => requireScreenProps().onHeaderEdit());
    await flush();
    assert.equal(requireScreenProps().value.header.uploadState, 'ready');

    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/avatar')] };
    await act(async () => requireScreenProps().onAvatarEdit());
    await flush();
    assert.equal(requireScreenProps().value.avatar.uploadState, 'error');
    assert.deepEqual(requireScreenProps().value.avatar.failure, {
      reason: 'transient',
      stage: 'complete',
    });
    assert.equal(issued, 2);
    assert.equal(fetchMock.mock.callCount(), 4);

    failAvatarCompletion = false;
    await act(async () => requireScreenProps().onAvatarRetry());
    await flush();
    assert.equal(requireScreenProps().value.avatar.uploadState, 'ready');
    assert.equal(issued, 3);
    assert.equal(fetchMock.mock.callCount(), 6);

    const changed = {
      ...requireScreenProps().value,
      bio: ' 저장할 소개 ',
      displayName: '새 이름',
      followPolicy: 'APPROVAL_REQUIRED',
      tags: ['Fediverse', '새태그'],
    };
    await act(async () => requireScreenProps().onChange(changed));
    let updateAttempts = 0;
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) => {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        config.onError(new Error('save failed'));
        return;
      }
      if (updateAttempts === 2) {
        config.onCompleted({} as never, [new Error('save failed')]);
        return;
      }
      config.onCompleted({
        updateProfile: {
          profile: {
            relativeHandle: '@updated',
            tags: [
              { id: 'hashtag-fediverse', name: 'Fediverse' },
              { id: 'hashtag-new', name: '새태그' },
            ],
          },
        },
      } as never);
    });

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(requireScreenProps().submitState.kind, 'idle');
    assert.deepEqual(toastMessages, ['프로필을 저장하지 못했어요.']);
    assert.equal(issued, 3);
    const firstUpdate = mutationCalls.get('ProfileEditRouteUpdateProfileMutation')?.[0];
    assert.deepEqual(firstUpdate?.variables, {
      input: {
        avatarId: 'media-issued-3',
        bio: '저장할 소개',
        displayName: '새 이름',
        followPolicy: 'APPROVAL_REQUIRED',
        headerId: 'media-issued-1',
        tags: ['Fediverse', '새태그'],
      },
    });

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(requireScreenProps().submitState.kind, 'idle');
    assert.deepEqual(toastMessages, ['프로필을 저장하지 못했어요.', '프로필을 저장하지 못했어요.']);
    assert.equal(issued, 3);
    assert.equal(fetchMock.mock.callCount(), 6);

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(issued, 3);
    assert.equal(fetchMock.mock.callCount(), 6);
    assert.deepEqual(routerReplacements, ['/@updated']);
    assert.deepEqual(requireScreenProps().value.tags, ['Fediverse', '새태그']);
    assert.deepEqual(requireScreenProps().initialValue.tags, ['Fediverse', '새태그']);
  });

  it('Tag server validation 오류에서 draft를 보존하고 수정 후 server 표시 이름으로 정렬한다', async () => {
    await renderRoute();
    const draft = { ...requireScreenProps().value, tags: ['Foo', 'foo'] };
    await act(async () => requireScreenProps().onChange(draft));

    let attempts = 0;
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) => {
      attempts += 1;
      if (attempts === 1) {
        config.onCompleted({} as never, [
          {
            message: '중복된 Profile Tag입니다.',
            extensions: { code: 'VALIDATION', field: 'tags.1' },
          },
        ]);
        return;
      }
      config.onCompleted({
        updateProfile: {
          profile: {
            relativeHandle: '@owner',
            tags: [{ id: 'hashtag-foo', name: 'Foo' }],
          },
        },
      } as never);
    });

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(requireScreenProps().serverErrors?.tags, '중복된 Profile Tag입니다.');
    assert.deepEqual(requireScreenProps().value.tags, ['Foo', 'foo']);
    assert.deepEqual(toastMessages, []);

    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, tags: ['foo'] }),
    );
    assert.equal(requireScreenProps().serverErrors?.tags, undefined);

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(attempts, 2);
    assert.deepEqual(requireScreenProps().value.tags, ['Foo']);
    assert.deepEqual(requireScreenProps().initialValue.tags, ['Foo']);
  });

  it('allowlisted signed PUT 실패를 Profile field 오류와 retry name으로 연결한다', async () => {
    let issued = 0;
    let completed = 0;
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
      config.onCompleted({ completeMediaUpload: { media: { state: 'READY' } } } as never);
    });
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === normalizedImageUri) {
          return new Response(new Blob(['normalized-webp'], { type: 'image/webp' }), {
            status: 200,
          });
        }
        assert.equal(init?.method, 'PUT');
        return new Response(
          JSON.stringify({
            error: { code: 'size_limit_exceeded', message: 'storage secret' },
          }),
          { status: 413, headers: { 'content-type': 'application/json' } },
        );
      },
    );
    await renderRoute();

    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/avatar')] };
    await act(async () => requireScreenProps().onAvatarEdit());
    await flush();

    assert.equal(issued, 1);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(completed, 0);
    assert.deepEqual(requireScreenProps().value.avatar.failure, {
      reason: 'file-too-large',
      stage: 'transfer',
    });
  });

  it('변경된 draft의 닫기, Web, Android 이탈을 같은 확인 dialog로 막는다', async () => {
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '변경된 소개' }),
    );

    await act(async () => {
      requireScreenProps().onBack();
    });
    assert.equal(routerBackCalls, 1);
    assert.equal(requireBeforeRemoveEvent(lastBackEvent).preventDefault.mock.callCount(), 1);
    assert.equal(requireDiscardDialogProps().visible, true);
    await act(async () => requireDiscardDialogProps().onContinue());

    for (const source of ['web-browser', 'android-hardware']) {
      let event: BeforeRemoveEvent | null = null;
      await act(async () => {
        event = emitBeforeRemove({ source, type: 'GO_BACK' });
      });
      assert.equal(requireBeforeRemoveEvent(event).preventDefault.mock.callCount(), 1);
      assert.equal(requireDiscardDialogProps().visible, true);
      await act(async () => requireDiscardDialogProps().onContinue());
    }
  });

  it('직접 진입해 back이 불가능하면 현재 Profile replace를 확인 dialog로 막는다', async () => {
    routerCanGoBack = false;
    triggerBeforeRemoveOnReplace = true;
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '직접 진입 변경' }),
    );

    await act(async () => requireScreenProps().onBack());

    assert.equal(routerBackCalls, 0);
    assert.equal(requireBeforeRemoveEvent(lastReplaceEvent).preventDefault.mock.callCount(), 1);
    assert.deepEqual(routerReplacements, []);
    assert.equal(requireDiscardDialogProps().visible, true);
  });

  it('dialog가 열린 동안 첫 GO_BACK action의 nested target을 제거하고 한 번만 dispatch한다', async () => {
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, displayName: '새 이름' }),
    );
    const first = { source: 'first', target: 'nested-stack', type: 'GO_BACK' };
    const second = { source: 'second', type: 'POP_TO_TOP' };

    let firstEvent: BeforeRemoveEvent | null = null;
    let secondEvent: BeforeRemoveEvent | null = null;
    await act(async () => {
      firstEvent = emitBeforeRemove(first);
      secondEvent = emitBeforeRemove(second);
    });
    assert.equal(requireBeforeRemoveEvent(firstEvent).preventDefault.mock.callCount(), 1);
    assert.equal(requireBeforeRemoveEvent(secondEvent).preventDefault.mock.callCount(), 1);

    await act(async () => requireDiscardDialogProps().onDiscard());
    assert.deepEqual(navigationDispatches, [{ ...first, target: undefined }]);
    assert.equal(requireDiscardDialogProps().visible, false);

    let nextEvent: BeforeRemoveEvent | null = null;
    await act(async () => {
      nextEvent = emitBeforeRemove({ source: 'next', type: 'GO_BACK' });
    });
    assert.equal(requireBeforeRemoveEvent(nextEvent).preventDefault.mock.callCount(), 1);
    assert.equal(requireDiscardDialogProps().visible, true);
  });

  it('저장 중에는 dialog 없이 이탈을 막는다', async () => {
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '저장 중인 소개' }),
    );
    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    assert.equal(requireScreenProps().submitState.kind, 'saving');

    let event: BeforeRemoveEvent | null = null;
    await act(async () => {
      event = emitBeforeRemove({ source: 'saving', type: 'GO_BACK' });
    });
    assert.equal(requireBeforeRemoveEvent(event).preventDefault.mock.callCount(), 1);
    assert.equal(requireDiscardDialogProps().visible, false);
    assert.deepEqual(navigationDispatches, []);
  });

  it('저장 성공 navigation은 guard를 먼저 해제하고 replace한다', async () => {
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '저장할 소개' }),
    );
    triggerBeforeRemoveOnReplace = true;
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) =>
      config.onCompleted({
        updateProfile: {
          profile: {
            relativeHandle: '@updated',
            tags: [
              { id: 'hashtag-fediverse', name: 'Fediverse' },
              { id: 'hashtag-development', name: '개발' },
            ],
          },
        },
      } as never),
    );

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));

    assert.deepEqual(routerReplacements, ['/@updated']);
    assert.equal(requireBeforeRemoveEvent(lastReplaceEvent).preventDefault.mock.callCount(), 0);
    assert.equal(requireDiscardDialogProps().visible, false);
  });

  it('비동기 Web navigation에서 clean baseline이 늦은 beforeRemove를 허용한다', async () => {
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '저장할 소개' }),
    );
    triggerBeforeRemoveOnReplace = true;
    deferBeforeRemoveOnReplace = true;
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) =>
      config.onCompleted({
        updateProfile: {
          profile: {
            relativeHandle: '@updated',
            tags: [
              { id: 'hashtag-fediverse', name: 'Fediverse' },
              { id: 'hashtag-development', name: '개발' },
            ],
          },
        },
      } as never),
    );

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));

    assert.equal(requireScreenProps().submitState.kind, 'idle');
    assert.deepEqual(requireScreenProps().initialValue, requireScreenProps().value);
    await completeDeferredReplace();
    assert.deepEqual(routerReplacements, ['/@updated']);
    assert.equal(requireBeforeRemoveEvent(lastReplaceEvent).preventDefault.mock.callCount(), 0);

    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '다시 변경한 소개' }),
    );
    let event: BeforeRemoveEvent | null = null;
    await act(async () => {
      event = emitBeforeRemove({ source: 'after-success-edit', type: 'GO_BACK' });
    });
    assert.equal(requireBeforeRemoveEvent(event).preventDefault.mock.callCount(), 1);
    assert.equal(requireDiscardDialogProps().visible, true);
  });

  it('비동기 성공 REPLACE 전에 생긴 새 draft를 discard guard로 보호한다', async () => {
    await renderRoute();
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '저장할 소개' }),
    );
    triggerBeforeRemoveOnReplace = true;
    deferBeforeRemoveOnReplace = true;
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) =>
      config.onCompleted({
        updateProfile: {
          profile: {
            relativeHandle: '@updated',
            tags: [
              { id: 'hashtag-fediverse', name: 'Fediverse' },
              { id: 'hashtag-development', name: '개발' },
            ],
          },
        },
      } as never),
    );

    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: 'commit 전 새 소개' }),
    );
    await completeDeferredReplace();

    assert.deepEqual(routerReplacements, []);
    assert.equal(requireScreenProps().value.bio, 'commit 전 새 소개');
    assert.equal(requireBeforeRemoveEvent(lastReplaceEvent).preventDefault.mock.callCount(), 1);
    assert.equal(requireDiscardDialogProps().visible, true);
  });

  it('navigation no-op과 실패에서도 Ready Media ID를 재사용하고 재업로드하지 않는다', async () => {
    let issued = 0;
    mutationHandlers.set('ProfileEditRouteIssueMediaUploadUrlMutation', (config) => {
      issued += 1;
      config.onCompleted({
        issueMediaUploadUrl: {
          media: { id: `media-issued-${issued}` },
          uploadUrl: `https://upload.example/${issued}`,
        },
      } as never);
    });
    mutationHandlers.set('ProfileEditRouteCompleteMediaUploadMutation', (config) =>
      config.onCompleted({ completeMediaUpload: { media: { state: 'READY' } } } as never),
    );
    const fetchMock = mockSuccessfulUploadFetch();
    await renderRoute();

    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/header')] };
    await act(async () => requireScreenProps().onHeaderEdit());
    await flush();
    pickerResult = { canceled: false, assets: [asset('blob:https://kosmo.example/avatar')] };
    await act(async () => requireScreenProps().onAvatarEdit());
    await flush();
    await act(async () =>
      requireScreenProps().onChange({
        ...requireScreenProps().value,
        bio: '저장 no-op',
        followPolicy: 'APPROVAL_REQUIRED',
      }),
    );
    mutationHandlers.set('ProfileEditRouteUpdateProfileMutation', (config) =>
      config.onCompleted({
        updateProfile: {
          profile: {
            relativeHandle: '@updated',
            tags: [
              { id: 'hashtag-fediverse', name: 'Fediverse' },
              { id: 'hashtag-development', name: '개발' },
            ],
          },
        },
      } as never),
    );

    noOpReplace = true;
    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));
    await act(async () =>
      requireScreenProps().onChange({ ...requireScreenProps().value, bio: '저장 failure' }),
    );
    noOpReplace = false;
    throwOnReplace = true;
    await act(async () => requireScreenProps().onSubmit(requireScreenProps().value));

    const updateCalls = mutationCalls.get('ProfileEditRouteUpdateProfileMutation');
    assert.equal(requireScreenProps().submitState.kind, 'idle');
    assert.deepEqual(requireScreenProps().initialValue, requireScreenProps().value);
    assert.equal(requireScreenProps().value.followPolicy, 'APPROVAL_REQUIRED');
    assert.equal(requireScreenProps().initialValue.followPolicy, 'APPROVAL_REQUIRED');
    assert.equal(updateCalls?.length, 2);
    assert.deepEqual(
      updateCalls?.map((call) => call.variables.input),
      [
        {
          avatarId: 'media-issued-2',
          bio: '저장 no-op',
          displayName: '기존 이름',
          followPolicy: 'APPROVAL_REQUIRED',
          headerId: 'media-issued-1',
          tags: ['Fediverse', '개발'],
        },
        {
          avatarId: 'media-issued-2',
          bio: '저장 failure',
          displayName: '기존 이름',
          followPolicy: 'APPROVAL_REQUIRED',
          headerId: 'media-issued-1',
          tags: ['Fediverse', '개발'],
        },
      ],
    );
    assert.equal(issued, 2);
    assert.equal(fetchMock.mock.callCount(), 4);
  });
});
