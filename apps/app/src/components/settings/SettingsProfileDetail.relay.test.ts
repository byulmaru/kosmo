import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, forwardRef, Fragment, Suspense, useImperativeHandle } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ComponentType, PropsWithChildren, ReactNode, Ref } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { AccountDeletionScreenProps } from './AccountDeletionScreen';
import type { SettingsProfileDetail as SettingsProfileDetailExport } from './SettingsProfileDetail';

type Request = {
  actorId: string | null;
  name: string;
  variables: Record<string, unknown>;
  sink: { next(response: GraphQLResponse): void; error(error: Error): void; complete(): void };
};
type ActorProviderProps = PropsWithChildren<{
  createEnvironment?: (token: string | null, selectedProfileId: string | null) => Environment;
}>;
type SessionValue = {
  accountId: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
  status: string;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
let requests: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let storedProfileId: string | null = null;
let accountState: AccountDeletionScreenProps['state'] | null = null;
let SettingsProfileDetail: typeof SettingsProfileDetailExport;
let SettingsAccountDeletionRoute: ComponentType;
let RelayActorProvider: ComponentType<ActorProviderProps>;
let RelayActorBoundary: ComponentType<PropsWithChildren>;
let SessionProvider: ComponentType<PropsWithChildren>;
let useSession: () => SessionValue;
let useRelayActor: () => { resetActor: (profileId?: string | null) => void };

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const View = forwardRef<unknown, { children?: ReactNode; [key: string]: unknown }>(
  function TestView({ children }, ref) {
    useImperativeHandle(ref as Ref<unknown>, () => ({ focus: () => undefined }));
    return createElement('View', null, children as ReactNode);
  },
);

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    if (name === 'SessionProviderQuery') {
      return require('../../session/__generated__/SessionProviderQuery.graphql.ts').default;
    }
    if (name.startsWith('SettingsAccountDeletion')) {
      return require(`../../app/(tabs)/(protected)/settings/__generated__/${name}.graphql.ts`)
        .default;
    }
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View,
  useWindowDimensions: () => ({ height: 800, width: 400 }),
});
mockModule('react-native/Libraries/promiseRejectionTrackingOptions', { default: {} });
mockModule('react-native/Libraries/Promise', { default: Promise });
mockModule('lucide-react-native', {
  ArrowLeft: 'ArrowLeft',
  Check: 'Check',
  ChevronLeftIcon: 'ChevronLeftIcon',
  ChevronRight: 'ChevronRight',
  Info: 'Info',
});
mockModule('react-native-svg', {
  Circle: 'Circle',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Path: 'Path',
  Rect: 'Rect',
  Stop: 'Stop',
  Svg: 'Svg',
});
mockModule('@/auth/selectedProfileStorage', {
  deleteSelectedProfile: async () => {
    storedProfileId = null;
  },
  readSelectedProfile: async () => storedProfileId,
  writeSelectedProfile: async (profileId: string) => {
    storedProfileId = profileId;
  },
});
mockModule('@/auth/tokenStorage', {
  deleteSessionToken: async () => undefined,
  readSessionToken: async () => null,
  writeSessionToken: async () => undefined,
});
mockModule('@/components/Splash', { Splash: () => null });
mockModule('@/observability/sentry', { captureHandledMessage: () => undefined });
mockModule('@/components/RelayFailOpenBoundary', {
  RelayFailOpenBoundary: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children, loading }: { children: ReactNode; loading: ReactNode }) =>
    createElement(Suspense, { fallback: loading }, children),
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule('@/components/PageHeader', { PageHeader: () => createElement('PageHeader') });
mockModule(new URL('../profile/ProfileListItemContent.tsx', import.meta.url), {
  ProfileListItemContent: ({
    children,
    displayName,
    identity,
    relativeHandle,
  }: {
    children?: ReactNode;
    displayName: string;
    identity?: ReactNode;
    relativeHandle?: string;
  }) =>
    createElement(
      'ProfileListItemContent',
      null,
      identity ??
        createElement(
          Fragment,
          null,
          createElement('Text', null, displayName),
          relativeHandle ? createElement('Text', null, relativeHandle) : null,
        ),
      children,
    ),
});
mockModule(new URL('./ProfilePostingSettings.tsx', import.meta.url), {
  ProfilePostingSettings: () => createElement('ProfilePostingSettings'),
});
mockModule('@/components/settings/AccountDeletionScreen', {
  AccountDeletionScreen: (props: AccountDeletionScreenProps) => {
    accountState = props.state ?? null;
    return createElement('AccountDeletionScreen', props);
  },
});
mockModule('@/components/settings/SettingsRouteContext', {
  useSettingsDetailHeaderMode: () => 'hidden',
});
mockModule('@/components/settings/settingsNavigation', { returnToSettingsParent: () => undefined });
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => null });
mockModule('@/components/shell/NavigationGuardContext', {
  useNavigationGuard: () => ({ register: () => () => undefined, request: () => false }),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
mockModule('@/components/ui/IconButton', {
  IconButton: (props: object) => createElement('IconButton', props),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children }: { children?: ReactNode }) =>
    createElement('ModalSheet', null, children),
});
mockModule('@/components/ui/RouteScrollContainer', {
  RouteScrollContainer: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/components/ui/ToastProvider', {
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  useToast: () => ({ showToast: () => () => undefined }),
});
mockModule('@/session/logout', {
  useAccountDeletionCleanup: () => ({ error: null, logout: () => undefined, pending: false }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => new Proxy({}, { get: (_target, key) => `theme-${String(key)}` }),
});
mockModule('expo-router', { useRouter: () => ({ replace: () => undefined }) });

before(async () => {
  const globals = globalThis as typeof globalThis & { __DEV__?: unknown };
  const previousDev = globals.__DEV__;
  globals.__DEV__ = true;
  try {
    ({ SettingsProfileDetail } = await import('./SettingsProfileDetail'));
    ({ default: SettingsAccountDeletionRoute } =
      await import('../../app/(tabs)/(protected)/settings/account-deletion'));
    ({ RelayActorBoundary, RelayActorProvider, useRelayActor } =
      await import('@/relay/RelayActorProvider'));
    ({ SessionProvider, useSession } = await import('@/session/SessionProvider'));
  } finally {
    if (previousDev === undefined) {
      delete globals.__DEV__;
    } else {
      globals.__DEV__ = previousDev;
    }
  }
});
beforeEach(() => {
  requests = [];
  storedProfileId = null;
  accountState = null;
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
});

function createEnvironment(_token: string | null, actorId: string | null) {
  return new Environment({
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ actorId, name: operation.name, variables, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function SessionProbe() {
  return createElement('SessionProbe', useSession());
}

function TestTree() {
  return createElement(
    RelayActorProvider,
    { createEnvironment },
    createElement(
      SessionProvider,
      null,
      createElement(
        Fragment,
        null,
        createElement(ActorProbe),
        createElement(
          RelayActorBoundary,
          null,
          createElement(SettingsProfileDetail),
          createElement(SettingsAccountDeletionRoute),
          createElement(SessionProbe),
        ),
      ),
    ),
  );
}

function ActorProbe() {
  const { resetActor } = useRelayActor();
  return createElement('ActorProbe', {
    switchTo: (profileId: string) => {
      storedProfileId = profileId;
      resetActor(profileId);
    },
  });
}

function latestRequest(actorId: string | null, name: string) {
  const request = requests.findLast((item) => item.actorId === actorId && item.name === name);
  assert.ok(request, `Missing ${name} request for actor ${actorId}`);
  return request;
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

function sessionData(selectedProfileId: string | null) {
  return {
    currentSession: {
      id: 'session:owner',
      selectedProfile: selectedProfileId ? { id: selectedProfileId } : null,
    },
    me: { id: 'account:owner', name: 'Owner' },
  };
}

function detailData(profileId = 'profile:owner', displayName = 'Owner Profile') {
  return {
    currentSession: {
      id: 'session:owner',
      selectedProfile: {
        id: profileId,
        displayName,
        relativeHandle: '@owner',
        followPolicy: 'OPEN',
        instance: { kind: 'LOCAL' },
        private: { defaultPostVisibility: 'PUBLIC' },
        viewerState: { membership: { id: `membership:${profileId}`, role: 'OWNER' } },
      },
    },
  };
}

function all(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function pressableForText(text: string) {
  const result = all('Pressable').find(
    (node) =>
      node.findAll((child) => (child.type as unknown) === 'Text' && child.children.includes(text))
        .length > 0,
  );
  assert.ok(result, `Missing Pressable containing ${text}`);
  return result;
}

function button(label: string) {
  const result = all('Button').find((node) => node.children.includes(label));
  assert.ok(result, `Missing ${label} button`);
  return result;
}

describe('SettingsProfileDetail real Relay profile deletion flow', () => {
  it('deleting the last profile resets the actor, confirms a fresh Session, and unlocks account withdrawal', async () => {
    await act(async () => {
      renderer = create(createElement(TestTree));
    });

    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData('profile:owner'));
    await respond(
      latestRequest('profile:owner', 'SessionProviderQuery'),
      sessionData('profile:owner'),
    );
    await respond(latestRequest('profile:owner', 'SettingsProfileDetailQuery'), detailData());
    await respond(latestRequest('profile:owner', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:owner' }] },
    });

    assert.deepEqual(accountState, { activeProfileCount: 1, phase: 'blocked' });
    assert.equal(storedProfileId, 'profile:owner');
    await act(async () => pressableForText('프로필 삭제').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('프로필 삭제').props.onPress());

    const mutation = latestRequest('profile:owner', 'SettingsProfileDetailDeleteProfileMutation');
    assert.deepEqual(mutation.variables, { input: { id: 'profile:owner' } });
    await respond(mutation, {
      deleteProfile: {
        success: true,
        profileId: 'profile:owner',
        account: { id: 'account:owner', profiles: [] },
      },
    });

    assert.equal(storedProfileId, null);
    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData(null));
    await respond(latestRequest(null, 'SettingsProfileDetailQuery'), {
      currentSession: { id: 'session:owner', selectedProfile: null },
    });
    await respond(latestRequest(null, 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [] },
    });

    const probe = all('SessionProbe').at(-1);
    assert.equal(probe?.props.status, 'valid');
    assert.equal(probe?.props.accountId, 'account:owner');
    assert.equal(probe?.props.sessionId, 'session:owner');
    assert.equal(probe?.props.selectedProfileId, null);
    assert.ok(all('StateView').some((node) => node.props.title === '설정할 Profile이 없어요'));
    for (const type of ['Button', 'Pressable']) {
      assert.equal(
        all(type).some(
          (control) =>
            control.children.includes('프로필 삭제') ||
            control.findAll(
              (child) =>
                (child.type as unknown) === 'Text' && child.children.includes('프로필 삭제'),
            ).length > 0,
        ),
        false,
      );
    }
    assert.deepEqual(accountState, { acknowledged: false, phase: 'idle' });
  });

  it('deleting a Profile selects the server-provided remaining Profile and preserves the account session', async () => {
    await act(async () => {
      renderer = create(createElement(TestTree));
    });

    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData('profile:owner'));
    await respond(
      latestRequest('profile:owner', 'SessionProviderQuery'),
      sessionData('profile:owner'),
    );
    await respond(latestRequest('profile:owner', 'SettingsProfileDetailQuery'), detailData());
    await respond(latestRequest('profile:owner', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:owner' }, { id: 'profile:b' }] },
    });

    assert.deepEqual(accountState, { activeProfileCount: 2, phase: 'blocked' });
    assert.equal(storedProfileId, 'profile:owner');
    await act(async () => pressableForText('프로필 삭제').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('프로필 삭제').props.onPress());

    const mutation = latestRequest('profile:owner', 'SettingsProfileDetailDeleteProfileMutation');
    await respond(mutation, {
      deleteProfile: {
        success: true,
        profileId: 'profile:owner',
        account: { id: 'account:owner', profiles: [{ id: 'profile:b' }] },
      },
    });

    assert.equal(storedProfileId, 'profile:b');
    await respond(latestRequest('profile:b', 'SessionProviderQuery'), sessionData('profile:b'));
    await respond(
      latestRequest('profile:b', 'SettingsProfileDetailQuery'),
      detailData('profile:b', 'Profile B'),
    );
    await respond(latestRequest('profile:b', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:b' }] },
    });

    const probe = all('SessionProbe').at(-1);
    assert.equal(probe?.props.status, 'valid');
    assert.equal(probe?.props.accountId, 'account:owner');
    assert.equal(probe?.props.sessionId, 'session:owner');
    assert.equal(probe?.props.selectedProfileId, 'profile:b');
    assert.equal(
      all('Text').some((node) => node.children.includes('Profile B')),
      true,
    );
    assert.deepEqual(accountState, { activeProfileCount: 1, phase: 'blocked' });
  });

  it('reselects the next eligible Profile when the first fallback cannot be selected', async () => {
    await act(async () => {
      renderer = create(createElement(TestTree));
    });

    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData('profile:owner'));
    await respond(
      latestRequest('profile:owner', 'SessionProviderQuery'),
      sessionData('profile:owner'),
    );
    await respond(latestRequest('profile:owner', 'SettingsProfileDetailQuery'), detailData());
    await respond(latestRequest('profile:owner', 'SettingsAccountDeletionQuery'), {
      me: {
        id: 'account:owner',
        profiles: [{ id: 'profile:owner' }, { id: 'profile:b' }, { id: 'profile:c' }],
      },
    });

    await act(async () => pressableForText('프로필 삭제').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('프로필 삭제').props.onPress());

    const mutation = latestRequest('profile:owner', 'SettingsProfileDetailDeleteProfileMutation');
    await respond(mutation, {
      deleteProfile: {
        success: true,
        profileId: 'profile:owner',
        account: {
          id: 'account:owner',
          profiles: [{ id: 'profile:b' }, { id: 'profile:c' }],
        },
      },
    });

    assert.equal(storedProfileId, 'profile:b');
    assert.ok(requests.some((request) => request.actorId === 'profile:b'));
    await respond(latestRequest('profile:b', 'SessionProviderQuery'), sessionData(null));

    assert.equal(storedProfileId, 'profile:c');
    assert.ok(requests.some((request) => request.actorId === 'profile:c'));
    await respond(latestRequest('profile:c', 'SessionProviderQuery'), sessionData('profile:c'));
    await respond(
      latestRequest('profile:c', 'SettingsProfileDetailQuery'),
      detailData('profile:c', 'Profile C'),
    );
    await respond(latestRequest('profile:c', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:c' }] },
    });

    const probe = all('SessionProbe').at(-1);
    assert.equal(probe?.props.status, 'valid');
    assert.equal(probe?.props.accountId, 'account:owner');
    assert.equal(probe?.props.selectedProfileId, 'profile:c');
    assert.equal(storedProfileId, 'profile:c');
    assert.ok(all('Text').some((node) => node.children.includes('Profile C')));
  });

  it('clears the stored selection after every returned fallback Profile is rejected', async () => {
    await act(async () => {
      renderer = create(createElement(TestTree));
    });

    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData('profile:owner'));
    await respond(
      latestRequest('profile:owner', 'SessionProviderQuery'),
      sessionData('profile:owner'),
    );
    await respond(latestRequest('profile:owner', 'SettingsProfileDetailQuery'), detailData());
    await respond(latestRequest('profile:owner', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:owner' }, { id: 'profile:b' }] },
    });

    await act(async () => pressableForText('프로필 삭제').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('프로필 삭제').props.onPress());

    const mutation = latestRequest('profile:owner', 'SettingsProfileDetailDeleteProfileMutation');
    await respond(mutation, {
      deleteProfile: {
        success: true,
        profileId: 'profile:owner',
        account: { id: 'account:owner', profiles: [{ id: 'profile:b' }] },
      },
    });

    assert.equal(storedProfileId, 'profile:b');
    await respond(latestRequest('profile:b', 'SessionProviderQuery'), sessionData(null));

    assert.equal(storedProfileId, null);
    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData(null));
    await respond(latestRequest(null, 'SettingsProfileDetailQuery'), {
      currentSession: { id: 'session:owner', selectedProfile: null },
    });
    await respond(latestRequest(null, 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [] },
    });

    const probe = all('SessionProbe').at(-1);
    assert.equal(probe?.props.status, 'valid');
    assert.equal(probe?.props.accountId, 'account:owner');
    assert.equal(probe?.props.selectedProfileId, null);
    assert.equal(storedProfileId, null);
    assert.ok(all('StateView').some((node) => node.props.title === '설정할 Profile이 없어요'));
  });

  it('retries a committed Profile deletion after a lost response and converges the fresh session actor', async () => {
    await act(async () => {
      renderer = create(createElement(TestTree));
    });

    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData('profile:owner'));
    await respond(
      latestRequest('profile:owner', 'SessionProviderQuery'),
      sessionData('profile:owner'),
    );
    await respond(latestRequest('profile:owner', 'SettingsProfileDetailQuery'), detailData());
    await respond(latestRequest('profile:owner', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:owner' }] },
    });

    await act(async () => pressableForText('프로필 삭제').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('프로필 삭제').props.onPress());

    const firstMutation = latestRequest(
      'profile:owner',
      'SettingsProfileDetailDeleteProfileMutation',
    );
    await act(async () => firstMutation.sink.error(new Error('response lost after server commit')));
    assert.equal(storedProfileId, 'profile:owner');
    assert.equal(all('SessionProbe').at(-1)?.props.selectedProfileId, 'profile:owner');
    assert.ok(all('Text').some((node) => node.children.includes('Owner Profile')));
    assert.ok(button('다시 시도'));

    await act(async () => button('다시 시도').props.onPress());
    const retryMutation = latestRequest(
      'profile:owner',
      'SettingsProfileDetailDeleteProfileMutation',
    );
    assert.deepEqual(retryMutation.variables, { input: { id: 'profile:owner' } });
    await respond(retryMutation, {
      deleteProfile: {
        success: true,
        profileId: 'profile:owner',
        account: { id: 'account:owner', profiles: [] },
      },
    });

    assert.equal(storedProfileId, null);
    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData(null));
    await respond(latestRequest(null, 'SettingsProfileDetailQuery'), {
      currentSession: { id: 'session:owner', selectedProfile: null },
    });
    await respond(latestRequest(null, 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [] },
    });

    const probe = all('SessionProbe').at(-1);
    assert.equal(probe?.props.status, 'valid');
    assert.equal(probe?.props.accountId, 'account:owner');
    assert.equal(probe?.props.sessionId, 'session:owner');
    assert.equal(probe?.props.selectedProfileId, null);
    assert.ok(all('StateView').some((node) => node.props.title === '설정할 Profile이 없어요'));
    assert.equal(
      all('Text').some((node) => node.children.includes('Owner Profile')),
      false,
    );
    assert.deepEqual(accountState, { acknowledged: false, phase: 'idle' });
  });

  it('a late Profile deletion for A preserves selected Profile B and its settings UI', async () => {
    await act(async () => {
      renderer = create(createElement(TestTree));
    });

    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData('profile:owner'));
    await respond(
      latestRequest('profile:owner', 'SessionProviderQuery'),
      sessionData('profile:owner'),
    );
    await respond(latestRequest('profile:owner', 'SettingsProfileDetailQuery'), detailData());
    await respond(latestRequest('profile:owner', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:owner' }, { id: 'profile:other' }] },
    });

    assert.equal(storedProfileId, 'profile:owner');
    await act(async () => pressableForText('프로필 삭제').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('프로필 삭제').props.onPress());

    const firstMutation = latestRequest(
      'profile:owner',
      'SettingsProfileDetailDeleteProfileMutation',
    );
    await act(async () => firstMutation.sink.error(new Error('response lost after server commit')));
    assert.equal(storedProfileId, 'profile:owner');
    assert.ok(button('다시 시도'));
    await act(async () => button('다시 시도').props.onPress());

    const retryMutation = latestRequest(
      'profile:owner',
      'SettingsProfileDetailDeleteProfileMutation',
    );
    assert.deepEqual(retryMutation.variables, { input: { id: 'profile:owner' } });

    await act(async () => {
      const actorProbe = all('ActorProbe').at(-1);
      assert.ok(actorProbe);
      actorProbe.props.switchTo('profile:other');
    });
    assert.equal(storedProfileId, 'profile:other');
    await respond(
      latestRequest('profile:other', 'SessionProviderQuery'),
      sessionData('profile:other'),
    );
    await respond(
      latestRequest('profile:other', 'SettingsProfileDetailQuery'),
      detailData('profile:other', 'Other Profile'),
    );
    await respond(latestRequest('profile:other', 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [{ id: 'profile:other' }] },
    });
    assert.equal(
      all('Text').some((node) => node.children.includes('Other Profile')),
      true,
    );
    assert.deepEqual(accountState, { activeProfileCount: 1, phase: 'blocked' });

    await respond(retryMutation, {
      deleteProfile: {
        success: true,
        profileId: 'profile:owner',
        account: {
          id: 'account:owner',
          profiles: [{ id: 'profile:c' }, { id: 'profile:other' }],
        },
      },
    });

    assert.equal(storedProfileId, 'profile:other');
    assert.equal(all('SessionProbe').at(-1)?.props.selectedProfileId, 'profile:other');
    assert.equal(
      requests.some((request) => request.actorId === 'profile:c'),
      false,
    );
    assert.equal(
      all('Text').some((node) => node.children.includes('Other Profile')),
      true,
    );
    assert.deepEqual(accountState, { activeProfileCount: 1, phase: 'blocked' });
    assert.ok(pressableForText('프로필 삭제'));
  });
});
