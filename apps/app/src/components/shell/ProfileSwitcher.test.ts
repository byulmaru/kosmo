import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ProfileSwitcher as ProfileSwitcherComponent } from './ProfileSwitcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PlatformName = 'android' | 'ios' | 'web';
type MutationResult = {
  complete: (response: unknown, errors?: ReadonlyArray<unknown>) => void;
  fail: (cause: Error) => void;
};
type MutationOptions = {
  onCompleted?: (response: unknown, errors?: ReadonlyArray<unknown>) => void;
  onError?: (cause: Error) => void;
};
type PressableChildren = ReactNode | ((state: { pressed: boolean }) => ReactNode);

const platform: { OS: PlatformName } = { OS: 'ios' };
const resetActorCalls: Array<string | null | undefined> = [];
const documentMock = {
  addEventListener: () => undefined,
  querySelector: () => null,
  removeEventListener: () => undefined,
};
const queryData = {
  currentSession: {
    selectedProfile: {
      id: 'profile-a',
      handle: 'profile-a',
      relativeHandle: '@profile-a',
      displayName: 'Profile A',
      followingCount: 0,
      followersCount: 0,
      instance: { kind: 'LOCAL' as const },
      viewerState: { membership: { role: 'OWNER' as const } },
      avatar: null,
      header: null,
    },
  },
  me: {
    id: 'account-1',
    profiles: [
      {
        id: 'profile-a',
        handle: 'profile-a',
        relativeHandle: '@profile-a',
        displayName: 'Profile A',
        unreadNotificationCount: 0,
        avatar: null,
      },
      {
        id: 'profile-b',
        handle: 'profile-b',
        relativeHandle: '@profile-b',
        displayName: 'Profile B',
        unreadNotificationCount: 0,
        avatar: null,
      },
    ],
  },
};

let pendingSelectMutation: MutationResult | null = null;
let renderer: ReactTestRenderer | null = null;
let ProfileSwitcher: typeof ProfileSwitcherComponent;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

function MockNavigationLink({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return createElement('NavigationLink', props, children);
}

function MockPressable({
  children,
  ...props
}: {
  children?: PressableChildren;
  [key: string]: unknown;
}) {
  const renderedChildren = typeof children === 'function' ? children({ pressed: false }) : children;
  return createElement('Pressable', props, renderedChildren);
}

function MockModal({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return createElement('Modal', props, children);
}

function MockProfilePicker(props: Record<string, unknown>) {
  return createElement('ProfilePicker', props);
}

const resetActor = (profileId?: string | null) => {
  resetActorCalls.push(profileId);
};

function useMockMutation(mutation: unknown) {
  const [inFlight, setInFlight] = useState(false);
  const commit = (options: MutationOptions) => {
    setInFlight(true);
    const result: MutationResult = {
      complete: (response, errors) => {
        setInFlight(false);
        options.onCompleted?.(response, errors);
      },
      fail: (cause) => {
        setInFlight(false);
        options.onError?.(cause);
      },
    };
    if (mutation === 'ProfileSwitcherSelectProfileMutation') {
      pendingSelectMutation = result;
    }
  };

  return [commit, inFlight] as const;
}

mockModule('expo-router', { usePathname: () => '/home' });
mockModule('react-native', {
  Image: 'Image',
  Modal: MockModal,
  Platform: platform,
  Pressable: MockPressable,
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => style,
  },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) =>
    parts.join('').match(/(?:fragment|mutation)\s+(\w+)/)?.[1] ?? 'unknown',
  useFragment: () => queryData,
  useMutation: useMockMutation,
});
mockModule(require.resolve('lucide-react-native'), {
  ChevronDownIcon: 'ChevronDownIcon',
  ChevronUpIcon: 'ChevronUpIcon',
  PlusIcon: 'PlusIcon',
});
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
mockModule('@/components/profile/ProfilePicker', {
  ProfilePicker: MockProfilePicker,
});
mockModule('@/components/profile/ProfileSwitcherUnread', {
  ProfileSwitcherUnreadIndicator: () => null,
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/TextField', {
  TextField: (props: Record<string, unknown>) => createElement('TextField', props),
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActor: () => ({ resetActor }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    border: '#dddddd',
    card: '#ffffff',
    danger: '#cc0000',
    primary: '#000000',
    stateDisabledForeground: '#777777',
    surface: '#eeeeee',
    text: '#111111',
    textSecondary: '#555555',
    overlayScrim: '#00000088',
  }),
});
mockModule('./NavigationGuardContext', { useNavigationGuard: () => ({ request: () => false }) });
mockModule('./NavigationLink', { NavigationLink: MockNavigationLink });
mockModule('./shellLayout', {
  getProfileEditActionCurrentState: () => ({
    accessibilityState: undefined,
    ariaCurrent: undefined,
  }),
  getProfileEditActionTargetMetrics: () => undefined,
  profileEditActionLabelColor: '#ffffff',
});

before(async () => {
  ({ ProfileSwitcher } = await import('./ProfileSwitcher'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'ios';
  pendingSelectMutation = null;
  resetActorCalls.length = 0;
  delete (globalThis as { document?: unknown }).document;
  mock.restoreAll();
});

describe('ProfileSwitcher native actor reset lifecycle', () => {
  it('iOS는 native picker가 dismiss된 뒤에만 성공한 profile을 reset한다', async () => {
    await renderProfileSwitcher({ controlled: true, surface: 'drawer' });
    await openPicker();
    await startSelection();

    await completeSelection();
    assert.deepEqual(resetActorCalls, []);
    assert.equal(modal().props.visible, false);

    await dismissModal();
    assert.deepEqual(resetActorCalls, ['profile-b']);
    await dismissModal();
    assert.deepEqual(resetActorCalls, ['profile-b']);
  });

  it('pending 성공은 onDismiss 없이 unmount되어도 한 번만 reset한다', async () => {
    await renderProfileSwitcher();
    await openPicker();
    await startSelection();
    await completeSelection();
    const onDismiss = modal().props.onDismiss as () => void;

    await act(async () => {
      renderer?.unmount();
      renderer = null;
    });
    assert.deepEqual(resetActorCalls, ['profile-b']);

    await act(async () => onDismiss());
    assert.deepEqual(resetActorCalls, ['profile-b']);
  });

  it('취소 후 재오픈하고 새 onShow 전 성공해도 새 dismiss까지 reset을 보류한다', async () => {
    await renderProfileSwitcher();
    await openPicker();
    await startSelection();

    await closePicker();
    await dismissModal();
    await openPicker({ notifyNativeShow: false });

    await completeSelection();
    assert.deepEqual(resetActorCalls, []);
    assert.equal(modal().props.visible, false);

    await dismissModal();
    assert.deepEqual(resetActorCalls, ['profile-b']);
  });

  it('GraphQL/network 실패와 단순 취소는 actor를 reset하지 않는다', async () => {
    await renderProfileSwitcher();
    await openPicker();
    await startSelection();
    await completeSelection({}, [{ message: 'selection failed' }]);
    assert.deepEqual(resetActorCalls, []);
    await closePicker();
    await dismissModal();

    await openPicker();
    await startSelection();
    await failSelection();
    assert.deepEqual(resetActorCalls, []);
    await closePicker();
    await dismissModal();
    assert.deepEqual(resetActorCalls, []);

    await openPicker();
    await closePicker();
    await dismissModal();
    assert.deepEqual(resetActorCalls, []);
  });

  for (const platformName of ['android', 'web'] as const) {
    it(`${platformName}는 성공 callback에서 즉시 actor를 reset한다`, async () => {
      platform.OS = platformName;
      if (platformName === 'web') {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: documentMock,
        });
      }
      await renderProfileSwitcher();
      await openPicker();
      await startSelection();

      await completeSelection();
      assert.deepEqual(resetActorCalls, ['profile-b']);
    });
  }
});

function ControlledProfileSwitcher({ surface }: { surface: 'drawer' | 'full' }) {
  const [open, setOpen] = useState(false);

  return createElement(ProfileSwitcher, {
    onOpenChange: setOpen,
    open,
    query: {} as never,
    surface,
  });
}

async function renderProfileSwitcher({
  controlled = false,
  surface = 'full',
}: { controlled?: boolean; surface?: 'drawer' | 'full' } = {}) {
  await act(async () => {
    renderer = create(
      controlled
        ? createElement(ControlledProfileSwitcher, { surface })
        : createElement(ProfileSwitcher, { query: {} as never, surface }),
    );
  });
  assert.ok(renderer);
}

async function openPicker({ notifyNativeShow = true }: { notifyNativeShow?: boolean } = {}) {
  const trigger = profileTrigger();
  await act(async () => trigger.props.onPress());
  if (platform.OS !== 'web' && notifyNativeShow) {
    await act(async () => modal().props.onShow());
  }
}

async function closePicker() {
  const trigger = profileTrigger();
  await act(async () => trigger.props.onPress());
}

async function startSelection() {
  assert.ok(renderer);
  const picker = renderer.root.findByType(MockProfilePicker);
  await act(async () => picker.props.onSelect('profile-b'));
  assert.ok(pendingSelectMutation);
}

async function completeSelection(
  response: unknown = { selectProfile: { session: { selectedProfile: { id: 'profile-b' } } } },
  errors?: ReadonlyArray<unknown>,
) {
  const pending = pendingSelectMutation;
  assert.ok(pending);
  pendingSelectMutation = null;
  await act(async () => pending.complete(response, errors));
}

async function failSelection() {
  const pending = pendingSelectMutation;
  assert.ok(pending);
  pendingSelectMutation = null;
  await act(async () => pending.fail(new Error('network failed')));
}

async function dismissModal() {
  await act(async () => modal().props.onDismiss());
}

function profileTrigger(): ReactTestInstance {
  assert.ok(renderer);
  const trigger = renderer.root.findAllByProps({ accessibilityLabel: '프로필 목록' })[0];
  assert.ok(trigger);
  return trigger;
}

function modal(): ReactTestInstance {
  assert.ok(renderer);
  const nativeModal = renderer.root.findByType(MockModal);
  assert.ok(nativeModal);
  return nativeModal;
}
