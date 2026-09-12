import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FollowButton as FollowButtonExport } from './FollowButton';
import type { ProfileBlockAction as ProfileBlockActionExport } from './ProfileBlockAction';
import type { ProfileListItem as ProfileListItemExport } from './ProfileListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let renderer: ReactTestRenderer | null = null;
const changeBlockedCalls: Array<{
  change: {
    ownerProfileId: string;
    profileBlockId?: string | null;
    targetProfileId?: string | null;
  };
  nextBlocked: boolean;
}> = [];
const toastCalls: Array<{ message: string; tone: string }> = [];
let changeBlockedError: Error | null = null;
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
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useFragment: (fragment: unknown, reference: Record<string, unknown> | null) =>
    String(fragment).includes('ProfileBlockAction_profile on') ||
    String(fragment).includes('ProfileBlockAction_profileBlock on')
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
      change: {
        ownerProfileId: string;
        profileBlockId?: string | null;
        targetProfileId?: string | null;
      },
      nextBlocked: boolean,
    ) => {
      changeBlockedCalls.push({ change, nextBlocked });
      if (changeBlockedError) {
        throw changeBlockedError;
      }
    },
  }),
});
mockModule(new URL('./profileBlockErrors.ts', import.meta.url), {
  StaleProfileBlockRequestError: class StaleProfileBlockRequestError extends Error {},
});

let FollowButton: typeof FollowButtonExport;
let ProfileBlockAction: typeof ProfileBlockActionExport;
let ProfileListItem: typeof ProfileListItemExport;
before(async () => {
  ({ FollowButton } = await import('./FollowButton'));
  ({ ProfileBlockAction } = await import('./ProfileBlockAction'));
  ({ ProfileListItem } = await import('./ProfileListItem'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  platform.OS = 'web';
  changeBlockedCalls.length = 0;
  changeBlockedError = null;
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

test('내가 차단한 Profile은 고정된 차단 해제 action을 표시한다', async () => {
  await act(async () => {
    renderer = create(
      createElement(ProfileBlockAction, {
        nextBlocked: false,
        profileBlock: {
          id: 'profile-block-a',
          targetProfile: profile,
        } as never,
        surface: 'button',
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button?.props.children, '차단 해제');
  assert.equal(button?.props.accessibilityLabel, '코스모 @kosmo 차단 해제');
  assert.equal(button?.props.accessibilityState.selected, undefined);
  assert.equal(button?.props.onHoverIn, undefined);
  assert.equal(button?.props.onFocus, undefined);
});

test('서로 차단한 Profile은 내 차단 해제 확인과 mutation을 소유한다', async () => {
  let unblockSuccesses = 0;
  await act(async () => {
    renderer = create(
      createElement(ProfileBlockAction, {
        nextBlocked: false,
        onFeedback: ({ status }: { status: string }) =>
          status === 'success' ? (unblockSuccesses += 1) : undefined,
        profileBlock: {
          id: 'profile-block-a',
          targetProfile: profile,
        } as never,
        surface: 'button',
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button?.props.children, '차단 해제');
  await act(async () => button?.props.onPress());
  const modal = renderer?.root.find((node) => (node.type as unknown) === 'ModalSheet');
  const confirmation = renderer?.root.find(
    (node) => (node.type as unknown) === 'ConfirmationContent',
  );
  assert.equal(modal?.props.visible, true);
  assert.equal(confirmation?.props.message, '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.');
  assert.equal(confirmation?.props.tone, 'danger');

  await act(async () => confirmation?.props.onConfirm());
  assert.deepEqual(changeBlockedCalls, [
    {
      change: {
        ownerProfileId: 'viewer',
        profileBlockId: 'profile-block-a',
      },
      nextBlocked: false,
    },
  ]);
  assert.deepEqual(toastCalls, []);
  await act(async () => modal?.props.onDismiss());
  assert.deepEqual(toastCalls, [{ message: '차단을 해제했어요', tone: 'success' }]);
  assert.equal(unblockSuccesses, 1);
});

test('차단 해제 실패 시 확인창을 닫고 action으로 focus를 복귀한다', async () => {
  changeBlockedError = new Error('unblock failed');
  let focusCalls = 0;
  await act(async () => {
    renderer = create(
      createElement(ProfileBlockAction, {
        nextBlocked: false,
        profileBlock: {
          id: 'profile-block-a',
          targetProfile: profile,
        } as never,
        surface: 'button',
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  button?.props.controlRef({ focus: () => (focusCalls += 1) });
  await act(async () => button?.props.onPress());
  const confirmation = renderer?.root.find(
    (node) => (node.type as unknown) === 'ConfirmationContent',
  );
  await act(async () => {
    confirmation?.props.onConfirm();
    await Promise.resolve();
  });
  const modal = renderer?.root.find((node) => (node.type as unknown) === 'ModalSheet');
  assert.equal(modal?.props.visible, false);
  modal?.props.onDismiss();
  assert.equal(focusCalls, 1);
  assert.deepEqual(toastCalls, [
    { message: '차단을 해제하지 못했어요. 다시 시도해 주세요.', tone: 'danger' },
  ]);
});

test('관리 관계 fragment도 같은 차단 해제 action을 사용한다', async () => {
  await act(async () => {
    renderer = create(
      createElement(ProfileBlockAction, {
        nextBlocked: false,
        profileBlock: { id: 'profile-block-list', targetProfile: profile } as never,
        surface: 'button',
      }),
    );
  });
  const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button?.props.children, '차단 해제');
  await act(async () => button?.props.onPress());
  await act(async () =>
    renderer?.root
      .find((node) => (node.type as unknown) === 'ConfirmationContent')
      .props.onConfirm(),
  );
  assert.equal(changeBlockedCalls[0]?.change.profileBlockId, 'profile-block-list');
});

test('FollowButton은 높이를 공용 Button에 위임하고 96px 관계 action 폭을 사용한다', async () => {
  await act(async () => {
    renderer = create(createElement(FollowButton, { profile: {} as never }));
  });
  assert.ok(renderer);
  const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
  assert.equal(button.props.size, undefined);
  assert.equal(button.props.style.width, 96);
  assert.equal(button.props.style.height, undefined);
  assert.equal(button.props.hitSlop, undefined);
});

for (const os of ['ios', 'android'] as const) {
  test(`${os} 차단 action은 터치 영역을 공통 Button에 위임한다`, async () => {
    platform.OS = os;
    await act(async () => {
      renderer = create(
        createElement(ProfileBlockAction, {
          nextBlocked: false,
          profileBlock: {
            id: 'profile-block-a',
            targetProfile: profile,
          } as never,
          surface: 'button',
        }),
      );
    });
    const button = renderer?.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button?.props.hitSlop, undefined);
  });
}

for (const [os, marginVertical] of [
  ['web', 0],
  ['ios', -2],
  ['android', -4],
] as const) {
  test(`${os} ProfileListItem uses the 96×40 relation action without increasing row height`, async () => {
    platform.OS = os;
    await act(async () => {
      renderer = create(createElement(ProfileListItem, { profile: {} as never }));
    });
    assert.ok(renderer);
    const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button.props.size, undefined);
    assert.equal(button.props.style.width, 96);
    const parentStyle = Object.assign({}, ...button.parent!.props.style.flat());
    assert.equal(parentStyle.marginVertical, marginVertical);
  });
}
