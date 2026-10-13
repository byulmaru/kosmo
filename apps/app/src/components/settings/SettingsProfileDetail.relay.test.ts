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
type SessionValue = { selectedProfileId: string | null; status: string };

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
    identity,
  }: {
    children?: ReactNode;
    identity?: ReactNode;
  }) => createElement('ProfileListItemContent', null, identity, children),
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

describe('SettingsProfileDetail real Relay deactivation flow', () => {
  it('last profile disable resets the actor, confirms a fresh Session, and unlocks account withdrawal', async () => {
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
    await act(async () => pressableForText('프로필 비활성화').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('비활성화').props.onPress());

    const mutation = latestRequest('profile:owner', 'SettingsProfileDetailDeleteProfileMutation');
    assert.deepEqual(mutation.variables, { input: { id: 'profile:owner' } });
    await respond(mutation, { deleteProfile: { profileId: 'profile:owner' } });

    assert.equal(storedProfileId, null);
    await respond(latestRequest(null, 'SessionProviderQuery'), sessionData(null));
    await respond(latestRequest(null, 'SettingsProfileDetailQuery'), {
      currentSession: { id: 'session:owner', selectedProfile: null },
    });
    await respond(latestRequest(null, 'SettingsAccountDeletionQuery'), {
      me: { id: 'account:owner', profiles: [] },
    });

    const probe = all('SessionProbe').at(-1);
    assert.equal(probe?.props.selectedProfileId, null);
    assert.ok(all('StateView').some((node) => node.props.title === '설정할 Profile이 없어요'));
    for (const type of ['Button', 'Pressable']) {
      for (const label of ['다시 활성화', '영구 삭제', '프로필 비활성화']) {
        assert.equal(
          all(type).some(
            (control) =>
              control.children.includes(label) ||
              control.findAll(
                (child) => (child.type as unknown) === 'Text' && child.children.includes(label),
              ).length > 0,
          ),
          false,
        );
      }
    }
    assert.deepEqual(accountState, { acknowledged: false, phase: 'idle' });
  });

  it('a late disable for Profile A preserves the selected Profile B and its settings UI', async () => {
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
    await act(async () => pressableForText('프로필 비활성화').props.onPress());
    await act(async () => {
      const checkbox = all('Pressable').find((node) => node.props.accessibilityRole === 'checkbox');
      assert.ok(checkbox);
      checkbox.props.onPress();
    });
    await act(async () => button('비활성화').props.onPress());

    const mutation = latestRequest('profile:owner', 'SettingsProfileDetailDeleteProfileMutation');
    assert.deepEqual(mutation.variables, { input: { id: 'profile:owner' } });

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

    await respond(mutation, { deleteProfile: { profileId: 'profile:owner' } });

    assert.equal(storedProfileId, 'profile:other');
    assert.equal(all('SessionProbe').at(-1)?.props.selectedProfileId, 'profile:other');
    assert.equal(
      all('Text').some((node) => node.children.includes('Other Profile')),
      true,
    );
    assert.deepEqual(accountState, { activeProfileCount: 1, phase: 'blocked' });
    assert.ok(pressableForText('프로필 비활성화'));
  });
});
