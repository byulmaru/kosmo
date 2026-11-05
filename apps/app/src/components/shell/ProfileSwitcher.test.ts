import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  createReaderSelector,
  Environment,
  getFragment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import ProfileSwitcherFragment from './__generated__/ProfileSwitcher_query.graphql';
import SelectProfileMutation from './__generated__/ProfileSwitcherSelectProfileMutation.graphql';
import UniversalShellQueryArtifact from './__generated__/UniversalShellQuery.graphql';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ProfileSwitcher_query$data } from './__generated__/ProfileSwitcher_query.graphql';
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
let exitMounted = false;
const resetActorCalls: Array<string | null | undefined> = [];
const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
const selectedProfileWrites: string[] = [];
const queryData = {
  currentSession: {
    id: 'session-1',
    selectedProfile: {
      id: 'profile-a',
      handle: 'profile-a',
      relativeHandle: '@profile-a',
      displayName: 'Profile A',
      followingCount: 0,
      followersCount: 0,
      instance: { kind: 'LOCAL' as const },
      viewerState: { membership: { role: 'OWNER' as const, id: 'membership-a' } },
      avatar: null,
      header: null,
      unreadNotificationCount: 0,
      private: { defaultPostVisibility: 'PUBLIC' },
    },
  },
  me: {
    id: 'account-1',
    name: 'Account',
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
let fragmentData: typeof queryData = queryData;

let pendingSelectMutation: MutationResult | null = null;
let pendingCreateMutation: MutationResult | null = null;
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
  return createElement(
    'ProfilePicker',
    props,
    props.menuFooter as ReactNode,
    props.footer as ReactNode,
  );
}

function MockButton({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return createElement('Button', props, children);
}

function MockTextField(props: Record<string, unknown>) {
  return createElement('TextField', props);
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
    if (mutation === 'ProfileSwitcherCreateProfileMutation') {
      pendingCreateMutation = result;
    }
  };

  return [commit, inFlight] as const;
}

mockModule('expo-router', { usePathname: () => '/home' });
mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Image: 'Image',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: MockModal,
  Platform: platform,
  Pressable: MockPressable,
  StyleSheet: {
    absoluteFill: { position: 'absolute' },
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => style,
  },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) =>
    parts.join('').match(/(?:fragment|mutation)\s+(\w+)/)?.[1] ?? 'unknown',
  useFragment: () => fragmentData,
  useMutation: useMockMutation,
});
mockModule(require.resolve('lucide-react-native'), {
  ChevronDownIcon: 'ChevronDownIcon',
  ChevronUpIcon: 'ChevronUpIcon',
  PlusIcon: 'PlusIcon',
});
mockModule('@/analytics/client', {
  trackAnalytics: (...args: unknown[]) => {
    analyticsCalls.push(args as (typeof analyticsCalls)[number]);
  },
});
mockModule('@/auth/selectedProfileStorage', {
  writeSelectedProfile: async (profileId: string) => {
    selectedProfileWrites.push(profileId);
  },
});
mockModule('@/components/profile/ProfilePicker', {
  ProfilePicker: MockProfilePicker,
});
mockModule('@/components/profile/ProfileSwitcherUnread', {
  ProfileSwitcherUnreadIndicator: () => null,
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', {
  Button: MockButton,
});
mockModule('@/components/ui/TextField', {
  TextField: MockTextField,
});
mockModule('@/components/ui/useSafeAreaPadding', {
  useSafeAreaPadding: () => ({ padding: 8 }),
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    entered: visible,
    mounted: visible || exitMounted,
    progress: { interpolate: () => 1 },
  }),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: () => undefined }),
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActor: () => ({ resetActor }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ accountId: 'account-1', sessionId: 'session-1' }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    actionPrimaryBase: '#ffe597',
    actionPrimaryOnBase: '#1a1a1a',
    backgroundSurface: '#fafafb',
    feedbackDangerOnSubtle: '#7a271a',
    foregroundPrimary: '#1a1a1a',
    foregroundSecondary: '#64646f',
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
  exitMounted = false;
  fragmentData = queryData;
  pendingSelectMutation = null;
  pendingCreateMutation = null;
  resetActorCalls.length = 0;
  analyticsCalls.length = 0;
  selectedProfileWrites.length = 0;
  mock.restoreAll();
});

describe('ProfileSwitcher selection lifecycle', () => {
  it('Web picker remains inert through exit and can reopen without duplicating content', async () => {
    platform.OS = 'web';
    await renderProfileSwitcher();
    await openPicker();
    assert.equal(renderer?.root.findAllByType(MockProfilePicker).length, 1);

    exitMounted = true;
    await closePicker();
    const exitingPicker = renderer?.root.findByType('AnimatedView' as never);
    assert.equal(exitingPicker?.props.pointerEvents, 'none');
    assert.equal(exitingPicker?.props.accessibilityElementsHidden, true);
    const exitingInteractionGate = renderer?.root.findByType('div' as never);
    assert.equal(exitingInteractionGate?.props.inert, true);

    await openPicker();
    const reopenedPicker = renderer?.root.findByType('AnimatedView' as never);
    assert.equal(reopenedPicker?.props.pointerEvents, 'auto');
    const reopenedInteractionGate = renderer?.root.findByType('div' as never);
    assert.equal(reopenedInteractionGate?.props.inert, false);
    assert.equal(renderer?.root.findAllByType(MockProfilePicker).length, 1);
  });

  it('Native picker modal은 긴 목록을 담을 수 있도록 메뉴 높이를 제한한다', async () => {
    await renderProfileSwitcher({ surface: 'drawer' });
    await openPicker();

    const nativeMenu = renderer?.root.findByProps({ accessibilityViewIsModal: true });
    assert.ok(nativeMenu);
    assert.equal(nativeMenu.props.style[0].flexShrink, 1);
    assert.equal(nativeMenu.props.style[0].maxHeight, '100%');
    assert.equal(nativeMenu.props.style[1].transform[0].translateY, 1);

    const backdrop = renderer?.root
      .findAllByType('Pressable' as never)
      .find((pressable) => pressable.props.style?.position === 'absolute');
    assert.ok(backdrop);
    await act(async () => backdrop.props.onPress());
    assert.equal(modal().props.visible, false);

    await openPicker();
    exitMounted = true;
    await closePicker();
    const exitingSurface = renderer?.root.findAllByType('AnimatedView' as never)[0];
    assert.equal(modal().props.visible, true);
    assert.equal(exitingSurface?.props.pointerEvents, 'none');
    assert.equal(exitingSurface?.props.accessibilityElementsHidden, true);
    assert.equal(exitingSurface?.props.importantForAccessibility, 'no-hide-descendants');
    const exitingBackdrop = renderer?.root
      .findAllByType('Pressable' as never)
      .find((pressable) => pressable.props.style?.position === 'absolute');
    assert.equal(exitingBackdrop?.props.disabled, true);
  });

  it('성공한 프로필 전환은 선택된 profile id로 actor를 즉시 reset한다', async () => {
    await renderProfileSwitcher({ controlled: true, surface: 'drawer' });
    await openPicker();
    await startSelection();

    await completeSelection();
    assert.deepEqual(resetActorCalls, ['profile-b']);
    assert.deepEqual(selectedProfileWrites, ['profile-b']);
    assert.equal(modal().props.visible, false);
    assert.deepEqual(
      analyticsCalls.map(([event, properties]) => ({ event, properties })),
      [
        {
          event: 'profile_selected',
          properties: {
            previous_profile_id: 'profile-a',
            selected_profile_id: 'profile-b',
            selection_cause: 'direct',
          },
        },
      ],
    );
  });

  it('GraphQL/network 실패와 단순 취소는 actor를 reset하지 않는다', async () => {
    await renderProfileSwitcher();
    await openPicker();
    await startSelection();
    await completeSelection({ selectProfile: { profile: { id: 'profile-b' } } }, [
      { message: 'selection failed' },
    ]);
    assert.deepEqual(resetActorCalls, []);
    assert.equal(modal().props.visible, true);

    await closePicker();
    await openPicker();
    await startSelection();
    await failSelection();
    assert.deepEqual(resetActorCalls, []);
    assert.equal(modal().props.visible, true);

    await closePicker();
    await openPicker();
    await closePicker();
    assert.deepEqual(resetActorCalls, []);
    assert.equal(modal().props.visible, false);
  });
});

describe('ProfileSwitcher profile creation errors', () => {
  it('shows the profile limit error and preserves the entered handle', async () => {
    await renderProfileSwitcher();
    await openPicker();

    const picker = renderer?.root.findByType(MockProfilePicker);
    assert.ok(picker);
    await act(async () => picker.props.menuFooter.props.onPress());

    let textField = renderer?.root.findByType(MockTextField);
    assert.ok(textField);
    await act(async () => textField?.props.onChangeText('newprofile'));
    await act(async () => renderer?.root.findByType(MockButton).props.onPress());
    assert.ok(pendingCreateMutation);

    await act(async () =>
      pendingCreateMutation?.fail(
        Object.assign(new Error('GraphQL operation failed'), {
          source: {
            errors: [
              { message: 'Profile limit reached', extensions: { code: 'PROFILE_LIMIT_EXCEEDED' } },
            ],
          },
        }),
      ),
    );

    textField = renderer?.root.findByType(MockTextField);
    assert.ok(textField);
    assert.equal(textField.props.error, '프로필은 최대 10개까지 만들 수 있어요.');
    assert.equal(textField.props.value, 'newprofile');
    assert.equal(modal().props.visible, true);
    assert.equal(
      renderer?.root.findAllByProps({ accessibilityLabel: '새 프로필 만들기' }).length,
      1,
    );
  });
});

describe('ProfileSwitcher Relay normalization', () => {
  it('does not publish an incomplete selectedProfile link before the actor reset', () => {
    const environment = new Environment({
      network: Network.create(() => Promise.reject(new Error('network is not used'))),
      store: new Store(new RecordSource()),
    });
    const shell = createOperationDescriptor(getRequest(UniversalShellQueryArtifact), {});
    environment.commitPayload(shell, queryData);
    const profileSwitcherSelector = createReaderSelector(
      getFragment(ProfileSwitcherFragment),
      'client:root',
      {},
      shell.request,
    );

    const before = environment.lookup(profileSwitcherSelector);
    const beforeData = before.data as ProfileSwitcher_query$data | null;
    assert.equal(before.isMissingData, false);
    assert.equal(beforeData?.currentSession?.selectedProfile?.id, 'profile-a');
    assert.equal(beforeData?.currentSession?.selectedProfile?.instance?.kind, 'LOCAL');
    assert.equal(
      beforeData?.currentSession?.selectedProfile?.viewerState?.membership?.role,
      'OWNER',
    );

    const mutation = createOperationDescriptor(getRequest(SelectProfileMutation), {
      id: 'profile-b',
    });
    // Keep the legacy session payload in the fixture: the generated mutation must ignore it.
    environment.commitPayload(mutation, {
      selectProfile: {
        profile: { id: 'profile-b' },
        session: { id: 'session-1', selectedProfile: { id: 'profile-b' } },
      },
    });

    const after = environment.lookup(profileSwitcherSelector);
    const afterData = after.data as ProfileSwitcher_query$data | null;
    assert.equal(after.isMissingData, false);
    assert.equal(afterData?.currentSession?.selectedProfile?.id, 'profile-a');
    assert.equal(afterData?.currentSession?.selectedProfile?.instance?.kind, 'LOCAL');
    assert.equal(
      afterData?.currentSession?.selectedProfile?.viewerState?.membership?.role,
      'OWNER',
    );
  });
});

describe('ProfileSwitcher incomplete Relay data', () => {
  it('keeps the existing fallback and hides the local-only edit action', async () => {
    fragmentData = {
      ...queryData,
      currentSession: {
        ...queryData.currentSession,
        selectedProfile: { id: 'profile-a' } as typeof queryData.currentSession.selectedProfile,
      },
    };

    await renderProfileSwitcher({ surface: 'drawer' });

    profileTrigger();
    assert.equal(renderer?.root.findAllByProps({ accessibilityLabel: '프로필 편집' }).length, 0);
  });
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

async function openPicker() {
  const trigger = profileTrigger();
  await act(async () => trigger.props.onPress());
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
  response: unknown = { selectProfile: { profile: { id: 'profile-b' } } },
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
