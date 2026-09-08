import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toastCalls: Array<{ message: string; tone: string }> = [];
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  ScrollView: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ScrollView', props, children),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('Text', props, children),
  View: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('View', props, children),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useLazyLoadQuery: () => ({}),
  usePaginationFragment: () => ({}),
});
mockModule(new URL('../profile/ProfileBlockController.tsx', import.meta.url), {
  useProfileBlockMutations: () => ({ changeBlocked: async () => undefined }),
});
mockModule(new URL('../profile/profileBlockErrors.ts', import.meta.url), {
  StaleProfileBlockRequestError: class StaleProfileBlockRequestError extends Error {},
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
    createElement('Button', props, children),
});
mockModule(new URL('../ui/ConfirmationContent.tsx', import.meta.url), {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
mockModule(new URL('../ui/ModalSheet.tsx', import.meta.url), {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({
    showToast: (message: string, options: { tone: string }) =>
      toastCalls.push({ message, tone: options.tone }),
  }),
});
mockModule('../../theme/ThemeProvider', {
  useTheme: () => ({ borderDefault: 'border', foregroundPrimary: 'foreground' }),
});
mockModule('../../theme/tokens', {
  borderWidths: { 1: 1 },
  space: { 12: 12, 16: 16 },
  textStyles: { uiHeadingM: {} },
});
mockModule('../../relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'actor-a',
});
mockModule('../../session/SessionProvider', {
  useSession: () => ({ selectedProfileId: null }),
});

let BlockedProfilesView: ComponentType<{
  onUnblock: (profileBlockId: string) => Promise<void>;
  state:
    | { status: 'loading' }
    | { status: 'error'; onRetry: () => void }
    | {
        status: 'loaded';
        profiles: readonly { displayName: string; profileBlockId: string }[];
        pagination:
          | { status: 'end' }
          | { status: 'loading' }
          | { status: 'more'; onLoadMore: () => void }
          | { status: 'error'; onRetry: () => void };
      };
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ BlockedProfilesView } = await import('./SettingsBlockedProfiles'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  toastCalls.length = 0;
});

describe('차단한 프로필 목록', () => {
  const find = (type: string) => renderer?.root.find((node) => node.type === type);
  const findAll = (type: string) => renderer?.root.findAll((node) => node.type === type) ?? [];

  it('관계 ID로 확인 후 해제하고 처리 중 중복 요청을 막는다', async () => {
    let resolveRequest: (() => void) | undefined;
    const calls: string[] = [];
    const onUnblock = (profileBlockId: string) => {
      calls.push(profileBlockId);
      return new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
    };
    const state = {
      pagination: { status: 'end' as const },
      profiles: [{ displayName: '별마루', profileBlockId: 'profile-block-a' }],
      status: 'loaded' as const,
    };
    await act(async () => {
      renderer = create(createElement(BlockedProfilesView, { onUnblock, state }));
    });

    await act(async () => find('Button')?.props.onPress());
    const confirmation = find('ConfirmationContent');
    assert.equal(
      confirmation?.props.message,
      '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.',
    );
    assert.equal(find('ModalSheet')?.props.title, '이 프로필의 차단을 해제할까요?');
    assert.equal(confirmation?.props.tone, 'danger');

    await act(async () => {
      confirmation?.props.onConfirm();
      confirmation?.props.onConfirm();
    });
    assert.deepEqual(calls, ['profile-block-a']);
    assert.equal(find('ConfirmationContent')?.props.pending, true);

    await act(async () => resolveRequest?.());
    assert.equal(find('ModalSheet')?.props.visible, false);
    assert.deepEqual(toastCalls, [{ message: '차단을 해제했어요', tone: 'success' }]);
  });

  it('해제 실패 시 확인창과 목록을 유지하고 같은 관계 ID로 재시도한다', async () => {
    let attempts = 0;
    const state = {
      pagination: { status: 'end' as const },
      profiles: [{ displayName: '별마루', profileBlockId: 'profile-block-a' }],
      status: 'loaded' as const,
    };
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          onUnblock: async (profileBlockId) => {
            assert.equal(profileBlockId, 'profile-block-a');
            attempts += 1;
            if (attempts === 1) {
              throw new Error('network');
            }
          },
          state,
        }),
      );
    });
    await act(async () => find('Button')?.props.onPress());
    await act(async () => find('ConfirmationContent')?.props.onConfirm());
    assert.equal(find('ModalSheet')?.props.visible, true);
    assert.equal(findAll('ProfileListItemContent').length, 1);
    assert.deepEqual(toastCalls, [
      { message: '차단을 해제하지 못했어요. 다시 시도해 주세요.', tone: 'danger' },
    ]);

    await act(async () => find('ConfirmationContent')?.props.onConfirm());
    assert.equal(attempts, 2);
    assert.equal(find('ModalSheet')?.props.visible, false);
  });

  it('페이지네이션 오류에서도 기존 행과 재시도 동작을 유지한다', async () => {
    let retries = 0;
    await act(async () => {
      renderer = create(
        createElement(BlockedProfilesView, {
          onUnblock: async () => undefined,
          state: {
            pagination: { status: 'error', onRetry: () => (retries += 1) },
            profiles: [{ displayName: '별마루', profileBlockId: 'profile-block-a' }],
            status: 'loaded',
          },
        }),
      );
    });
    assert.equal(findAll('ProfileListItemContent').length, 1);
    const retry = findAll('Button').find((node) => node.children.includes('더 불러오기'));
    await act(async () => retry?.props.onPress());
    assert.equal(retries, 1);
  });
});
