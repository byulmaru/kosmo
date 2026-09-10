import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FollowButton as FollowButtonExport } from './FollowButton';
import type { ProfileListItem as ProfileListItemExport } from './ProfileListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let windowWidth = 1280;
let renderer: ReactTestRenderer | null = null;
const changeBlockedCalls: Array<{
  change: { handle?: string | null; ownerProfileId: string; profileBlockId?: string | null };
  nextBlocked: boolean;
}> = [];
const toastCalls: Array<{ message: string; tone: string }> = [];
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (styles: ReadonlyArray<object | undefined>) => Object.assign({}, ...styles),
  },
  Text: 'Text',
  useWindowDimensions: () => ({ width: windowWidth }),
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useFragment: (fragment: unknown, reference: Record<string, unknown> | null) =>
    String(fragment).includes('FollowButton_profileBlock on') ||
    String(fragment).includes('FollowButton_profileBlockStatus on')
      ? reference
      : reference && Object.keys(reference).length > 0
        ? reference
        : {
            avatar: null,
            bio: null,
            displayName: '코스모',
            followersCount: 0,
            followPolicy: 'OPEN',
            handle: 'kosmo',
            id: 'profile-kosmo',
            relativeHandle: '@kosmo',
            viewerState: { follow: null, followRequest: null, isSelf: false },
          },
  useMutation: () => [() => {}, false],
});
mockModule('@/analytics/client', { trackAnalytics: () => {} });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string, options: { tone: string }) =>
      toastCalls.push({ message, tone: options.tone }),
  }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: 'viewer' }),
});
mockModule('@/theme/ThemeProvider', { useTheme: () => ({}) });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/ConfirmationContent', { ConfirmationContent: 'ConfirmationContent' });
mockModule('@/components/ui/ModalSheet', { ModalSheet: 'ModalSheet' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/shell/NavigationLink', { NavigationLink: 'NavigationLink' });
mockModule(new URL('./ProfileNameBlock.tsx', import.meta.url), {
  ProfileNameBlock: 'ProfileNameBlock',
});
mockModule(new URL('./ProfileBlockController.tsx', import.meta.url), {
  useProfileBlockMutations: () => ({
    changeBlocked: async (
      change: { handle?: string | null; ownerProfileId: string; profileBlockId?: string | null },
      nextBlocked: boolean,
    ) => {
      changeBlockedCalls.push({ change, nextBlocked });
    },
  }),
});
mockModule(new URL('./profileBlockErrors.ts', import.meta.url), {
  StaleProfileBlockRequestError: class StaleProfileBlockRequestError extends Error {},
});

let FollowButton: typeof FollowButtonExport;
let ProfileListItem: typeof ProfileListItemExport;
before(async () => {
  ({ FollowButton } = await import('./FollowButton'));
  ({ ProfileListItem } = await import('./ProfileListItem'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  platform.OS = 'web';
  windowWidth = 1280;
  changeBlockedCalls.length = 0;
  toastCalls.length = 0;
});

const profile = {
  displayName: '코스모',
  followersCount: 0,
  followPolicy: 'OPEN',
  handle: 'kosmo',
  id: 'profile-kosmo',
  relativeHandle: '@kosmo',
  viewerState: { follow: null, followRequest: null, isSelf: false },
};

test('내가 차단한 Profile은 기본 차단됨, hover와 keyboard focus에서는 차단 해제를 표시한다', async () => {
  await act(async () => {
    renderer = create(
      createElement(FollowButton, {
        profile: profile as never,
        profileBlockStatus: {
          blockedBy: false,
          blocking: true,
          profileBlockId: 'profile-block-a',
        } as never,
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button?.props.children, '차단됨');

  await act(async () => button?.props.onHoverIn());
  assert.equal(
    renderer?.root.find((node) => (node.type as unknown) === 'Button').props.children,
    '차단 해제',
  );
  await act(async () => button?.props.onHoverOut());
  await act(async () => button?.props.onFocus());
  await act(async () => button?.props.onHoverIn());
  await act(async () => button?.props.onHoverOut());
  assert.equal(
    renderer?.root.find((node) => (node.type as unknown) === 'Button').props.children,
    '차단 해제',
  );
});

test('상대만 나를 차단한 Profile은 관계 버튼을 숨긴다', async () => {
  await act(async () => {
    renderer = create(
      createElement(FollowButton, {
        profile: profile as never,
        profileBlockStatus: {
          blockedBy: true,
          blocking: false,
          profileBlockId: null,
        } as never,
      }),
    );
  });
  assert.equal(renderer?.toJSON(), null);
});

test('서로 차단한 Profile은 내 차단 해제 확인과 mutation을 소유한다', async () => {
  let unblockSuccesses = 0;
  await act(async () => {
    renderer = create(
      createElement(FollowButton, {
        onUnblockSuccess: () => (unblockSuccesses += 1),
        profile: profile as never,
        profileBlockStatus: {
          blockedBy: true,
          blocking: true,
          profileBlockId: 'profile-block-a',
        } as never,
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button?.props.children, '차단됨');
  await act(async () => button?.props.onPress());
  const modal = renderer?.root.find((node) => (node.type as unknown) === 'ModalSheet');
  const confirmation = renderer?.root.find(
    (node) => (node.type as unknown) === 'ConfirmationContent',
  );
  assert.equal(modal?.props.visible, true);
  assert.equal(confirmation?.props.message, '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.');

  await act(async () => confirmation?.props.onConfirm());
  assert.deepEqual(changeBlockedCalls, [
    {
      change: {
        handle: 'kosmo',
        ownerProfileId: 'viewer',
        profileBlockId: 'profile-block-a',
      },
      nextBlocked: false,
    },
  ]);
  assert.deepEqual(toastCalls, [{ message: '차단을 해제했어요', tone: 'success' }]);
  assert.equal(unblockSuccesses, 1);
});

test('관리 관계 fragment도 같은 차단 해제 action을 사용한다', async () => {
  await act(async () => {
    renderer = create(
      createElement(FollowButton, {
        profile: profile as never,
        profileBlock: { id: 'profile-block-list' } as never,
        size: 'compact',
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button?.props.children, '차단됨');
  await act(async () => button?.props.onPress());
  await act(async () =>
    renderer?.root
      .find((node) => (node.type as unknown) === 'ConfirmationContent')
      .props.onConfirm(),
  );
  assert.equal(changeBlockedCalls[0]?.change.profileBlockId, 'profile-block-list');
});

for (const size of [undefined, 'compact'] as const) {
  test(`FollowButton ${size ?? 'default'} delegates height to Button and supplies width`, async () => {
    await act(async () => {
      renderer = create(createElement(FollowButton, { profile: {} as never, size }));
    });
    assert.ok(renderer);
    const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button.props.size, size === 'compact' ? 'compact' : 'default');
    assert.equal(button.props.style.width, size === 'compact' ? 72 : 96);
    assert.equal(button.props.style.height, undefined);
    assert.equal(button.props.hitSlop, undefined);
  });
}

for (const [os, width, expectedWidth, marginVertical] of [
  ['web', 767, 96, 0],
  ['web', 768, 72, 0],
  ['web', 1280, 72, 0],
  ['ios', 1280, 96, -2],
  ['android', 1280, 96, -4],
] as const) {
  test(`${os} ${width}px ProfileListItem selects the consumer size without increasing row height`, async () => {
    platform.OS = os;
    windowWidth = width;
    await act(async () => {
      renderer = create(createElement(ProfileListItem, { profile: {} as never }));
    });
    assert.ok(renderer);
    const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button.props.style.width, expectedWidth);
    const parentStyle = Object.assign({}, ...button.parent!.props.style.flat());
    assert.equal(parentStyle.marginVertical, marginVertical);
  });
}
