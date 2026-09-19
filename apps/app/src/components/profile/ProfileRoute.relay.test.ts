import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode, Ref } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  name: string;
  sink: {
    next(response: GraphQLResponse): void;
    complete(): void;
  };
};

const require = createRequire(import.meta.url);
const requests: Request[] = [];
const generation = { current: 0 };
let renderer: ReactTestRenderer | null = null;
let ProfileLayout: React.ComponentType;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return name === 'ProfileLayoutQuery'
      ? require('../../app/(tabs)/(profile)/[profileHandle]/__generated__/ProfileLayoutQuery.graphql.ts')
          .default
      : require(`./__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('expo-router', {
  Slot: () => null,
  Stack: () => null,
  useGlobalSearchParams: () => ({ profileHandle: '@target' }),
  usePathname: () => '/@target',
  useRouter: () => ({ back: () => undefined, replace: () => undefined }),
});
mockModule('lucide-react-native', {
  ArrowLeft: 'ArrowLeft',
  Ban: 'Ban',
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule(require.resolve('lucide-react-native'), {
  ArrowLeft: 'ArrowLeft',
  Ban: 'Ban',
  ChevronLeftIcon: 'ChevronLeftIcon',
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule(new URL('../content-report/ContentReportContext.tsx', import.meta.url), {
  useContentReportMenuItem: () => ({
    key: 'report-profile',
    label: '신고',
    onSelect: () => undefined,
    tone: 'danger',
  }),
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule(new URL('./ProfileConnectionList.tsx', import.meta.url), {
  ProfileConnectionListState: (props: object) => createElement('ProfileConnectionListState', props),
});
mockModule(new URL('./ProfileHero.tsx', import.meta.url), {
  ProfileHero: ({ action, ...props }: { action?: ReactNode }) =>
    createElement('ProfileHero', props, action),
});
mockModule(new URL('./ProfileRouteShell.tsx', import.meta.url), {
  ProfileRouteContainer: ({ children }: { children?: ReactNode }) => children,
  ProfileRouteProvider: ({ children }: { children?: ReactNode }) => children,
});
mockModule(new URL('../RouteBoundary.tsx', import.meta.url), {
  RouteBoundary: ({ children, loading }: { children?: ReactNode; loading?: ReactNode }) =>
    createElement(Suspense, { fallback: loading }, children),
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  NavigationLink: ({ children }: { children?: ReactNode }) => children,
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({
    children,
    controlRef,
    ...props
  }: {
    children?: ReactNode;
    controlRef?: Ref<unknown>;
  }) => {
    if (typeof controlRef === 'function') {
      controlRef({ focus: () => undefined });
    } else if (controlRef && typeof controlRef === 'object' && 'current' in controlRef) {
      controlRef.current = { focus: () => undefined };
    }
    return createElement('Button', props, children);
  },
});
mockModule(new URL('../ui/ConfirmationContent.tsx', import.meta.url), {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
mockModule(new URL('../ui/IconButton.tsx', import.meta.url), {
  IconButton: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('IconButton', props, children),
});
mockModule(new URL('../ui/ModalSheet.tsx', import.meta.url), {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../ui/Tabs.tsx', import.meta.url), {
  Tab: (props: object) => createElement('Tab', props),
  TabList: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('TabList', props, children),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({ showToast: () => undefined }),
});
mockModule(new URL('../../analytics/client.ts', import.meta.url), {
  trackAnalytics: () => undefined,
});
mockModule(new URL('../../relay/RelayEnvironmentBoundary.tsx', import.meta.url), {
  useRelayEnvironmentGeneration: () => generation,
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId: 'owner', sessionId: 'session' }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ foregroundPrimary: '#111111' }),
});

before(async () => {
  ({ default: ProfileLayout } = await import('../../app/(tabs)/(profile)/[profileHandle]/_layout'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
});

function createEnvironment() {
  return new Environment({
    network: Network.create((operation) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

async function render(environment: Environment) {
  await act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: createElement(ProfileLayout),
      }),
    );
  });
}

function all(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function one(type: string): ReactTestInstance {
  const matches = all(type);
  assert.equal(matches.length, 1, `Expected one ${type}`);
  return matches[0]!;
}

function button(label: string) {
  const found = all('Button').find((node) => node.props.children === label);
  assert.ok(found, `Missing ${label} button`);
  return found;
}

function latestRequest(name: string) {
  const request = requests.findLast((candidate) => candidate.name === name);
  assert.ok(request, `Missing ${name} request`);
  return request;
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

function readBlockState(environment: Environment) {
  let rootBlocking: unknown;
  let profileBlockId: string | null | undefined;
  environment.commitUpdate((store) => {
    rootBlocking = store
      .getRoot()
      .getLinkedRecord('profileBlockStatus', { handle: 'target' })
      ?.getValue('blocking');
    profileBlockId = store
      .get('profile-target')
      ?.getLinkedRecord('viewerState')
      ?.getLinkedRecord('profileBlock')
      ?.getDataID();
  });
  return { profileBlockId, rootBlocking };
}

const blockedProfile = (profileBlock: object | null) => ({
  __typename: 'Profile',
  id: 'profile-target',
  displayName: 'Target',
  handle: 'target',
  relativeHandle: '@target',
  followPolicy: 'PUBLIC',
  followersCount: 0,
  followingCount: 0,
  bio: null,
  tags: [],
  avatar: null,
  header: null,
  instance: { kind: 'LOCAL' },
  viewerState: {
    isSelf: false,
    membership: { id: 'membership-owner-target', role: 'MEMBER' },
    follow: null,
    followRequest: null,
    profileMute: null,
    profileBlock,
  },
});

describe('Profile route with real Relay', () => {
  it('mutual block 해제 뒤 normalized Profile의 own block이 사라지면 관계 action을 숨긴다', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileBlockStatus: {
        blockedBy: true,
      },
      profileByHandle: blockedProfile({
        __typename: 'ProfileBlock',
        id: 'block-1',
        targetProfile: {
          __typename: 'Profile',
          id: 'profile-target',
          displayName: 'Target',
          relativeHandle: '@target',
        },
      }),
    });
    environment.commitUpdate((store) => {
      const status = store.getRoot().getLinkedRecord('profileBlockStatus', { handle: 'target' });
      assert.ok(status);
      status.setValue(true, 'blocking');
    });
    assert.deepEqual(readBlockState(environment), {
      profileBlockId: 'block-1',
      rootBlocking: true,
    });

    await act(async () => button('차단 해제').props.onPress());
    await act(async () => one('ConfirmationContent').props.onConfirm());
    await respond(latestRequest('ProfileBlockActionUnblockMutation'), {
      unblockProfile: {
        success: true,
        profileBlockId: 'block-1',
        targetProfile: blockedProfile(null),
      },
    });

    assert.deepEqual(readBlockState(environment), {
      profileBlockId: undefined,
      rootBlocking: true,
    });
    assert.deepEqual(
      all('Button').map((node) => node.props.children),
      [],
    );
  });
});
