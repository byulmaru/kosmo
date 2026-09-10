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
const resetActorCalls: Array<string | null | undefined> = [];
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
  mock.restoreAll();
});

describe('ProfileSwitcher selection lifecycle', () => {
  it('성공한 프로필 전환은 선택된 profile id로 actor를 즉시 reset한다', async () => {
    await renderProfileSwitcher({ controlled: true, surface: 'drawer' });
    await openPicker();
    await startSelection();

    await completeSelection();
    assert.deepEqual(resetActorCalls, ['profile-b']);
    assert.equal(modal().props.visible, false);
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
