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
let scrollProps: { onScroll: (event: object) => void } | null = null;
let selectedProfile: object | null = { id: 'owner' };
type PaginationState = {
  data: { profileBlocks: { edges: Array<{ cursor: string; node: object }> } | null };
  hasNext: boolean;
  isLoadingNext: boolean;
  loadNext: ReturnType<typeof mock.fn>;
};
let pagination: PaginationState = {
  data: { profileBlocks: { edges: [] } },
  hasNext: false,
  isLoadingNext: false,
  loadNext,
};

mockModule('react-native', {
  Platform: { OS: 'ios' },
  ScrollView: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ScrollView', props, children),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('View', props, children),
});
mockModule(new URL('../pagination/PaginationScrollView.tsx', import.meta.url), {
  usePaginationScrollRegistration: (props: typeof scrollProps) => {
    scrollProps = props;
  },
});
mockModule(new URL('../pagination/PaginationSurface.tsx', import.meta.url), {
  PaginationSurface: (props: object) => createElement('PaginationSurface', props),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useFragment: (_fragment: unknown, reference: unknown) => reference,
  useLazyLoadQuery: () => ({ currentSession: { selectedProfile } }),
  usePaginationFragment: () => pagination,
});
mockModule(new URL('../profile/ProfileBlockAction.tsx', import.meta.url), {
  ProfileBlockAction: ({
    nextBlocked,
    profile,
    profileBlock,
  }: {
    nextBlocked: boolean;
    profile?: { id: string };
    profileBlock?: { id: string };
  }) =>
    createElement(
      'Button',
      {
        profileBlockId: profileBlock?.id,
        profileId: profile?.id,
      },
      nextBlocked ? '차단' : '차단 해제',
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
type BlockedProfile = {
  key: string;
  profileBlock: never;
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
  scrollProps = null;
  selectedProfile = { id: 'owner' };
  pagination = {
    data: { profileBlocks: { edges: [] } },
    hasNext: false,
    isLoadingNext: false,
    loadNext,
  };
});

const profile = (id: string, displayName = '별마루'): BlockedProfile => ({
  key: `cursor-${id}`,
  profileBlock: {
    id: `block-${id}`,
    targetProfile: {
      displayName,
      id: `profile-${id}`,
      relativeHandle: `@${id}`,
      avatar: { id: `avatar-${id}`, url: `https://media.example/${id}.png` },
      viewerState: { profileBlock: { id: `block-${id}` } },
    },
  } as never,
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
              cursor: 'cursor-star',
              node: {
                id: 'block-star',
                targetProfile: {
                  displayName: '별마루',
                  id: 'profile-star',
                  relativeHandle: '@star',
                  avatar: { id: 'avatar-star', url: 'https://media.example/star.png' },
                  viewerState: { profileBlock: { id: 'block-star' } },
                },
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

    assert.equal(find('ProfileListItemContent')?.props.avatarUri, 'https://media.example/star.png');
    assert.equal(find('ProfileListItemContent')?.props.relativeHandle, undefined);
    assert.equal(find('ProfileListItemContent')?.props.identity.props.children, '별마루');
    assert.equal(find('Button')?.props.profileBlockId, 'block-star');
    assert.equal(find('PaginationSurface')?.props.hasNext, true);
    assert.ok(scrollProps);
    await act(async () =>
      scrollProps?.onScroll({
        nativeEvent: {
          contentOffset: { y: 200 },
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 800 },
        },
      }),
    );
    assert.equal(pagination.loadNext.mock.callCount(), 1);

    await act(async () => onComplete?.(new Error('network')));
    const retry = find('PaginationSurface');
    assert.equal(retry?.props.error, true);
    await act(async () => retry?.props.onRetry());
    assert.equal(pagination.loadNext.mock.callCount(), 2);
  });

  it('selected Profile이 없으면 빈 목록 대신 Profile-required 상태를 표시한다', async () => {
    selectedProfile = null;

    await act(async () => {
      renderer = create(createElement(SettingsBlockedProfiles));
    });

    assert.equal(find('StateView')?.props.title, '설정할 Profile이 없어요');
    assert.equal(findAll('ProfileListItemContent').length, 0);
  });

  it('권한이 없는 nullable Block 목록은 Profile-required 상태로 표시한다', async () => {
    pagination = { ...pagination, data: { profileBlocks: null } };

    await act(async () => {
      renderer = create(createElement(SettingsBlockedProfiles));
    });

    assert.equal(find('StateView')?.props.title, '설정할 Profile이 없어요');
    assert.equal(findAll('ProfileListItemContent').length, 0);
  });

  it('목록 행이 실제 ProfileBlock 관계를 공통 해제 action에 연결한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          state: { pagination: { status: 'end' }, profiles: [profile('star')], status: 'loaded' },
        }),
      );
    });
    assert.equal(find('ProfileListItemContent')?.props.avatarUri, 'https://media.example/star.png');
    assert.equal(find('ProfileListItemContent')?.props.relativeHandle, undefined);
    assert.equal(find('ProfileListItemContent')?.props.identity.props.children, '별마루');
    assert.equal(find('Button')?.props.profileBlockId, 'block-star');
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
    const error = find('PaginationSurface');
    assert.equal(error?.props.error, true);
    await act(async () => error?.props.onRetry());
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

  it('해제 뒤 같은 행에서 차단 action으로 전환한다', async () => {
    const blockedProfile = profile('star');
    const unblocked = {
      ...blockedProfile,
      profileBlock: {
        ...(blockedProfile.profileBlock as object),
        targetProfile: {
          displayName: '별마루',
          id: 'profile-star',
          relativeHandle: '@star',
          viewerState: { profileBlock: null },
        },
      } as never,
    };
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          state: {
            pagination: { status: 'end' },
            profiles: [unblocked],
            status: 'loaded',
          },
        }),
      );
    });
    assert.equal(findAll('ProfileListItemContent').length, 1);
    assert.equal(find('Button')?.props.children, '차단');
    assert.equal(find('Button')?.props.profileId, 'profile-star');
  });
});
