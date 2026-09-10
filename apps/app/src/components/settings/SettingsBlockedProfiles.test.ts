import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { BlockedProfilesView as BlockedProfilesViewExport } from './SettingsBlockedProfiles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const actionFocusCalls = new Map<string, ReturnType<typeof mock.fn>>();

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
  useLazyLoadQuery: () => ({}),
  usePaginationFragment: () => ({}),
});
mockModule(new URL('../profile/FollowButton.tsx', import.meta.url), {
  FollowButton: ({
    onActionRef,
    onUnblockSuccess,
    profile,
    profileBlock,
    size,
  }: {
    onActionRef?: (node: unknown) => void;
    onUnblockSuccess?: () => void;
    profile: { relativeHandle: string };
    profileBlock: { id: string };
    size: string;
  }) => {
    onActionRef?.({ focus: () => actionFocusCalls.get(profileBlock.id)?.() });
    return createElement(
      'Button',
      {
        onPress: onUnblockSuccess,
        profileBlockId: profileBlock.id,
        relativeHandle: profile.relativeHandle,
        size,
      },
      '차단됨',
    );
  },
});
mockModule(new URL('../profile/ProfileListItemContent.tsx', import.meta.url), {
  ProfileListItemContent: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ProfileListItemContent', props, children),
});
mockModule(new URL('../RouteBoundary.tsx', import.meta.url), {
  RouteBoundary: ({ children }: { children?: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('PaginationButton', props, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('../../theme/tokens', { space: { 16: 16 } });
mockModule('../../relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'actor-a',
});

type BlockedProfile = {
  displayName: string;
  profile: never;
  profileBlock: never;
  profileBlockId: string;
  relativeHandle: string;
};
let BlockedProfilesView: typeof BlockedProfilesViewExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ BlockedProfilesView } = await import('./SettingsBlockedProfiles'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  actionFocusCalls.clear();
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
    assert.equal(find('Button')?.props.children, '차단됨');
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
    const error = find('StateView');
    assert.equal(error?.props.title, '프로필을 더 불러오지 못했어요');
    await act(async () => error?.props.onAction());
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
    const error = find('StateView');
    assert.equal(error?.props.alert, true);
    assert.equal(error?.props.title, '차단한 프로필을 불러오지 못했어요');
    await act(async () => error?.props.onAction());
    assert.equal(retries, 1);
  });

  it('마지막 항목 해제 뒤 새 목록 surface가 목록 제목에 포커스를 복원한다', async () => {
    const focus = mock.fn();
    const loaded = {
      pagination: { status: 'end' as const },
      profiles: [profile('star')],
      status: 'loaded' as const,
    };
    await act(async () => {
      renderer = create(createElement(BlockedProfilesView, { state: loaded }), {
        createNodeMock: (element) =>
          element.type === 'View' &&
          (element.props as { accessibilityLabel?: string }).accessibilityLabel ===
            '차단한 프로필 목록'
            ? { focus }
            : {},
      });
    });
    await act(async () => find('Button')?.props.onPress());
    await act(async () => {
      renderer?.update(
        createElement(BlockedProfilesView, {
          state: { pagination: { status: 'end' }, profiles: [], status: 'loaded' },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(focus.mock.callCount(), 1);
  });

  it('중간 항목 해제 뒤 다음 공통 action으로 포커스를 복원한다', async () => {
    const nextFocus = mock.fn();
    const first = profile('first');
    const second = profile('second');
    actionFocusCalls.set(second.profileBlockId, nextFocus);
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          state: { pagination: { status: 'end' }, profiles: [first, second], status: 'loaded' },
        }),
      );
    });
    await act(async () => findAll('Button')[0]?.props.onPress());
    await act(async () => {
      renderer?.update(
        createElement(BlockedProfilesView, {
          state: { pagination: { status: 'end' }, profiles: [second], status: 'loaded' },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(nextFocus.mock.callCount(), 1);
  });
});
