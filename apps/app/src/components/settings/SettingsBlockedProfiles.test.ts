import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  BlockedProfilesView as BlockedProfilesViewExport,
  SettingsBlockedProfiles as SettingsBlockedProfilesExport,
} from './SettingsBlockedProfiles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const toastCalls: Array<{ message: string; tone: string }> = [];
const loadNext = mock.fn();
let selectedProfile: object | null = { id: 'owner', instance: { kind: 'LOCAL' } };
let selectedProfileKind: 'ACTIVITYPUB' | 'LOCAL' | null = 'LOCAL';
const queryVariables: Array<{ withProfileBlocks?: boolean }> = [];
const paginationReferences: unknown[] = [];
let pagination = {
  data: { profileBlocks: { edges: [] as Array<{ node: object }> } },
  hasNext: false,
  isLoadingNext: false,
  loadNext,
};

mockModule('react-native', {
  ScrollView: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ScrollView', props, children),
  StyleSheet: { create: <T>(styles: T) => styles },
  View: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('View', props, children),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useFragment: (_fragment: unknown, reference: unknown) => reference,
  useLazyLoadQuery: (_query: unknown, variables: { withProfileBlocks?: boolean }) => {
    queryVariables.push(variables);
    if (selectedProfileKind !== 'LOCAL' && variables.withProfileBlocks !== false) {
      throw new Error('profileBlocks requires a selected Local Profile');
    }
    return { currentSession: { selectedProfile } };
  },
  usePaginationFragment: (_fragment: unknown, reference: unknown) => {
    paginationReferences.push(reference);
    return pagination;
  },
});
mockModule(new URL('../profile/FollowButton.tsx', import.meta.url), {
  FollowButton: ({
    onUnblockSuccess,
    profile,
    profileBlock,
    size,
  }: {
    onUnblockSuccess?: () => void;
    profile: { relativeHandle: string };
    profileBlock: { id: string };
    size: string;
  }) =>
    createElement(
      'Button',
      {
        onPress: onUnblockSuccess,
        profileBlockId: profileBlock.id,
        relativeHandle: profile.relativeHandle,
        size,
      },
      '차단 해제',
    ),
});
mockModule(new URL('../profile/ProfileListItemContent.tsx', import.meta.url), {
  ProfileListItemContent: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ProfileListItemContent', props, children),
});
mockModule(new URL('../RouteBoundary.tsx', import.meta.url), {
  RouteBoundary: ({ children }: { children?: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  useShellChrome: () => null,
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('PaginationButton', props, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({
    showToast: (message: string, options: { tone: string }) => {
      toastCalls.push({ message, tone: options.tone });
      return () => undefined;
    },
  }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ borderDefault: 'border', foregroundPrimary: 'foreground' }),
});
mockModule('../../theme/tokens', {
  borderWidths: { 1: 1 },
  space: { 16: 16 },
  textStyles: { uiHeadingM: {} },
});
mockModule('../../relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'actor-a',
});
mockModule('../../session/SessionProvider', {
  useSession: () => ({ selectedProfileKind }),
});

type BlockedProfile = {
  displayName: string;
  profile: never;
  profileBlock: never;
  profileBlockId: string;
  relativeHandle: string;
};
let BlockedProfilesView: typeof BlockedProfilesViewExport;
let SettingsBlockedProfiles: typeof SettingsBlockedProfilesExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ BlockedProfilesView, SettingsBlockedProfiles } = await import('./SettingsBlockedProfiles'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  toastCalls.length = 0;
  loadNext.mock.resetCalls();
  selectedProfile = { id: 'owner', instance: { kind: 'LOCAL' } };
  selectedProfileKind = 'LOCAL';
  queryVariables.length = 0;
  paginationReferences.length = 0;
  pagination = {
    data: { profileBlocks: { edges: [] } },
    hasNext: false,
    isLoadingNext: false,
    loadNext,
  };
});

const profile = (id: string, displayName = '별마루'): BlockedProfile => ({
  displayName,
  profile: { relativeHandle: `@${id}` } as never,
  profileBlock: { id: `block-${id}` } as never,
  profileBlockId: `block-${id}`,
  relativeHandle: `@${id}`,
});

describe('차단한 프로필 목록', () => {
  const find = (type: string) => renderer?.root.find((node) => (node.type as unknown) === type);
  const findAll = (type: string) =>
    renderer?.root.findAll((node) => (node.type as unknown) === type) ?? [];

  it('Relay connection을 목록 행에 연결하고 추가 조회 실패를 같은 pagination action으로 재시도한다', async () => {
    let onComplete: ((error?: Error | null) => void) | undefined;
    pagination = {
      data: {
        profileBlocks: {
          edges: [
            {
              node: {
                id: 'block-star',
                targetProfile: { displayName: '별마루', relativeHandle: '@star' },
              },
            },
          ],
        },
      },
      hasNext: true,
      isLoadingNext: false,
      loadNext: mock.fn(
        (_count: number, options: { onComplete: (error?: Error | null) => void }) => {
          onComplete = options.onComplete;
        },
      ),
    };

    await act(async () => {
      renderer = create(createElement(SettingsBlockedProfiles));
    });

    assert.equal(find('ProfileListItemContent')?.props.relativeHandle, '@star');
    assert.equal(find('Button')?.props.profileBlockId, 'block-star');
    await act(async () => find('PaginationButton')?.props.onPress());
    assert.equal(pagination.loadNext.mock.callCount(), 1);

    await act(async () => onComplete?.(new Error('network')));
    const retry = find('PaginationButton');
    assert.equal(retry?.props.children, '더 불러오기');
    await act(async () => retry?.props.onPress());
    assert.equal(pagination.loadNext.mock.callCount(), 2);
  });

  it('selected Local Profile이 없으면 빈 목록 대신 Profile-required 상태를 표시한다', async () => {
    selectedProfile = null;
    selectedProfileKind = null;

    await act(async () => {
      renderer = create(createElement(SettingsBlockedProfiles));
    });

    assert.equal(find('StateView')?.props.title, '설정할 Profile이 없어요');
    assert.equal(findAll('ProfileListItemContent').length, 0);
  });

  it('Remote selected actor는 Local-only Block 목록 조회를 건너뛴다', async () => {
    selectedProfile = { id: 'remote-owner', instance: { kind: 'ACTIVITYPUB' } };
    selectedProfileKind = 'ACTIVITYPUB';

    await act(async () => {
      renderer = create(createElement(SettingsBlockedProfiles));
    });

    assert.deepEqual(queryVariables, [{ withProfileBlocks: false }]);
    assert.deepEqual(paginationReferences, [null]);
    assert.equal(find('StateView')?.props.title, '설정할 Profile이 없어요');
    assert.equal(findAll('ProfileListItemContent').length, 0);
  });

  it('목록 행이 공통 FollowButton에 Profile과 차단 관계 fragment를 전달한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          state: { pagination: { status: 'end' }, profiles: [profile('star')], status: 'loaded' },
        }),
      );
    });
    assert.equal(find('ProfileListItemContent')?.props.relativeHandle, '@star');
    assert.equal(find('Button')?.props.profileBlockId, 'block-star');
    assert.equal(find('Button')?.props.relativeHandle, '@star');
    assert.equal(find('Button')?.props.size, 'compact');
    assert.equal(find('Button')?.props.children, '차단 해제');
  });

  it('페이지네이션 오류에서도 기존 행과 재시도 동작을 유지한다', async () => {
    let retries = 0;
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          state: {
            pagination: { status: 'error', onRetry: () => (retries += 1) },
            profiles: [profile('star')],
            status: 'loaded',
          },
        }),
      );
    });
    assert.equal(findAll('ProfileListItemContent').length, 1);
    const error = find('PaginationButton');
    assert.equal(error?.props.children, '더 불러오기');
    await act(async () => error?.props.onPress());
    assert.equal(retries, 1);
  });

  it('최초 조회 오류를 alert와 재시도 action으로 전달한다', async () => {
    let retries = 0;
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          state: { status: 'error', onRetry: () => (retries += 1) },
        }),
      );
    });
    const error = find('PaginationButton');
    assert.equal(error?.props.children, '다시 시도');
    assert.deepEqual(toastCalls, [
      { message: '차단한 프로필을 불러오지 못했어요', tone: 'danger' },
    ]);
    assert.equal(findAll('ScrollView').length, 0);
    await act(async () => error?.props.onPress());
    assert.equal(retries, 1);
  });

  it('마지막 항목 해제 뒤 새 목록 surface가 목록 제목에 포커스를 복원한다', async () => {
    const focus = mock.fn();
    const headingRef = { current: { focus } } as never;
    const loaded = {
      pagination: { status: 'end' as const },
      profiles: [profile('star')],
      status: 'loaded' as const,
    };
    await act(async () => {
      renderer = create(createElement(BlockedProfilesView, { headingRef, state: loaded }));
    });
    await act(async () => find('Button')?.props.onPress());
    await act(async () => {
      renderer?.update(
        createElement(BlockedProfilesView, {
          headingRef,
          state: { pagination: { status: 'end' }, profiles: [], status: 'loaded' },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(focus.mock.callCount(), 1);
  });

  it('중간 항목 해제 뒤에도 목록 제목으로 포커스를 복원한다', async () => {
    const focus = mock.fn();
    const headingRef = { current: { focus } } as never;
    const first = profile('first');
    const second = profile('second');
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          headingRef,
          state: { pagination: { status: 'end' }, profiles: [first, second], status: 'loaded' },
        }),
      );
    });
    await act(async () => findAll('Button')[0]?.props.onPress());
    await act(async () => {
      renderer?.update(
        createElement(BlockedProfilesView, {
          headingRef,
          state: { pagination: { status: 'end' }, profiles: [second], status: 'loaded' },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(focus.mock.callCount(), 1);
  });

  it('다른 actor는 이전 Profile의 해제 포커스 intent를 소비하지 않는다', async () => {
    const focus = mock.fn();
    const headingRef = { current: { focus } } as never;
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          ownerProfileId: 'owner-a',
          state: {
            pagination: { status: 'end' },
            profiles: [profile('star')],
            status: 'loaded',
          },
        }),
      );
    });
    await act(async () => find('Button')?.props.onPress());
    await act(async () => renderer?.unmount());

    const renderEmptyOwner = async (ownerProfileId: string) => {
      await act(async () => {
        renderer = create(
          createElement(BlockedProfilesView, {
            headingRef,
            ownerProfileId,
            state: { pagination: { status: 'end' }, profiles: [], status: 'loaded' },
          }),
        );
      });
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    };

    await renderEmptyOwner('owner-b');
    assert.equal(focus.mock.callCount(), 0);
    await act(async () => renderer?.unmount());
    await renderEmptyOwner('owner-a');
    assert.equal(focus.mock.callCount(), 1);
  });
});
