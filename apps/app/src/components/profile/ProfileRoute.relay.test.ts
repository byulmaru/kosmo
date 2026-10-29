import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, StrictMode } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode, Ref } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  variables: Record<string, unknown>;
  environmentId: string;
  name: string;
  sink: {
    next(response: GraphQLResponse): void;
    complete(): void;
    error(error: Error): void;
  };
};

const require = createRequire(import.meta.url);
const requests: Request[] = [];
const generation = { current: 0 };
let renderer: ReactTestRenderer | null = null;
let ProfileLayout: React.ComponentType;
let ProfileFollowersPage: React.ComponentType;
let ProfileFollowingPage: React.ComponentType;
let ProfilePostListPage: React.ComponentType | null = null;
let routeHandle = '@target';
let routePath = '/@target';
let globalPath = '/@target';
const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
const navigation = {
  addListener(event: 'focus' | 'blur', callback: () => void) {
    listeners[event].add(callback);
    return () => {
      listeners[event].delete(callback);
    };
  },
};

function blurRoute() {
  listeners.blur.forEach((callback) => callback());
}
function focusRoute() {
  listeners.focus.forEach((callback) => callback());
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('expo-router', {
  Slot: () => {
    const Route = routePath.endsWith('/followers')
      ? ProfileFollowersPage
      : routePath.endsWith('/following')
        ? ProfileFollowingPage
        : ProfilePostListPage;
    return Route ? createElement(Route) : null;
  },
  Stack: () => null,
  useGlobalSearchParams: () => ({ profileHandle: routeHandle }),
  useCurrentRouteInfo: () => ({ params: { profileHandle: routeHandle }, pathname: routePath }),
  useNavigation: () => navigation,
  useLocalSearchParams: () => ({ profileHandle: routeHandle }),
  usePathname: () => globalPath,
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
  useWindowDimensions: () => ({ height: 800, width: 1_280 }),
  View: 'View',
});
mockModule(new URL('../content-report/ContentReportContext.tsx', import.meta.url), {
  getContentReportBlockProfile: () => undefined,
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
  ProfileConnectionList: (props: object) => createElement('ProfileConnectionList', props),
  ProfileConnectionListState: (props: object) => createElement('ProfileConnectionListState', props),
});
mockModule(new URL('./ProfileHero.tsx', import.meta.url), {
  ProfileHero: ({ action, ...props }: { action?: ReactNode }) =>
    createElement('ProfileHero', props, action),
});
mockModule(new URL('../pagination/PaginationScrollView.tsx', import.meta.url), {
  PaginationScrollView: ({ children }: { children?: ReactNode }) => children,
});
mockModule(new URL('../post/PostList.tsx', import.meta.url), {
  PostList: ({ error, loading, onRetry, ...props }: Record<string, unknown>) =>
    createElement('PostList', { ...props, error, loading, onRetry }),
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
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
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
  ({ default: ProfileFollowersPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/followers'));
  ({ default: ProfileFollowingPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/following'));
  ({ default: ProfilePostListPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/index'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
  routeHandle = '@target';
  routePath = '/@target';
  globalPath = '/@target';
});

function createEnvironment(environmentId = 'default') {
  return new Environment({
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ environmentId, name: operation.name, sink, variables });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

async function render(environment: Environment, strictMode = false) {
  const route = createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(ProfileLayout),
  });
  await act(async () => {
    renderer = create(strictMode ? createElement(StrictMode, null, route) : route);
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

function latestRequest(name: string, environmentId?: string) {
  const request = requests.findLast(
    (candidate) =>
      candidate.name === name &&
      (environmentId === undefined || candidate.environmentId === environmentId),
  );
  assert.ok(request, `Missing ${name} request`);
  return request;
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

async function fail(request: Request) {
  await act(async () => request.sink.error(new Error(`${request.environmentId}:${request.name}`)));
}

function readBlockState(environment: Environment) {
  let blockedBy: unknown;
  let profileBlockId: string | null | undefined;
  environment.commitUpdate((store) => {
    const viewerState = store.get('profile-target')?.getLinkedRecord('viewerState');
    blockedBy = viewerState?.getValue('blockedBy');
    profileBlockId = viewerState?.getLinkedRecord('profileBlock')?.getDataID();
  });
  return { blockedBy, profileBlockId };
}

const blockedProfile = (profileBlock: object | null, blockedBy = false) => ({
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
    blockedBy,
    isSelf: false,
    membership: { id: 'membership-owner-target', role: 'MEMBER' },
    follow: null,
    followRequest: null,
    profileMute: null,
    profileBlock,
  },
});

const emptyPostsProfile = (blockedBy = false) => ({
  ...blockedProfile(null, blockedBy),
  posts: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  pinnedPosts: [],
});

describe('Profile route with real Relay', () => {
  it('StrictMode loads one operation and renders posts', async () => {
    await render(createEnvironment(), true);
    assert.deepEqual(
      requests.map((r) => r.name),
      ['ProfileScreenQuery'],
    );
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(),
    });
    assert.equal(one('PostList').props.profile.id, 'profile-target');
  });
  it('blockedBy retains header and hides posts', async () => {
    await render(createEnvironment());
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(true),
    });
    assert.equal(all('PostList').length, 0);
    assert.equal(one('StateView').props.title, '이 프로필을 볼 수 없습니다');
  });
  it('missing profile hides posts', async () => {
    await render(createEnvironment());
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: null,
    });
    assert.equal(all('PostList').length, 0);
    assert.equal(one('StateView').props.title, '프로필을 찾을 수 없어요');
  });
  it('old actor response cannot populate new actor screen', async () => {
    await render(createEnvironment('old'));
    const old = latestRequest('ProfileScreenQuery', 'old');
    await act(async () => renderer?.unmount());
    renderer = null;
    await render(createEnvironment('new'));
    await respond(old, {
      currentSession: null,
      profileByHandle: { ...emptyPostsProfile(), displayName: 'Old' },
    });
    assert.equal(all('PostList').length, 0);
    await respond(latestRequest('ProfileScreenQuery', 'new'), {
      currentSession: null,
      profileByHandle: { ...emptyPostsProfile(), displayName: 'New' },
    });
    assert.equal(one('PageHeader').props.title, 'New');
  });
  it('late old handle response does not reveal old posts', async () => {
    const environment = createEnvironment();
    await render(environment);
    const old = latestRequest('ProfileScreenQuery');
    routeHandle = '@other';
    routePath = '/@other';
    await act(async () =>
      renderer?.update(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: createElement(ProfileLayout),
        }),
      ),
    );
    const next = latestRequest('ProfileScreenQuery');
    assert.notEqual(old, next);
    await respond(old, { currentSession: null, profileByHandle: emptyPostsProfile() });
    assert.equal(all('PostList').length, 0);
    await respond(next, {
      currentSession: null,
      profileByHandle: {
        ...emptyPostsProfile(),
        id: 'other-id',
        handle: 'other',
        relativeHandle: '@other',
        displayName: 'Other',
      },
    });
    assert.equal(one('PageHeader').props.title, 'Other');
  });
  it('own block acknowledgement resets on actor remount', async () => {
    const profile = {
      ...emptyPostsProfile(),
      viewerState: {
        ...emptyPostsProfile().viewerState,
        profileBlock: {
          __typename: 'ProfileBlock',
          id: 'block-1',
          targetProfile: {
            __typename: 'Profile',
            id: 'profile-target',
            displayName: 'Target',
            relativeHandle: '@target',
          },
        },
      },
    };
    await render(createEnvironment('old'));
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: profile,
    });
    assert.equal(all('PostList').length, 0);
    await act(async () => one('StateView').props.onAction());
    assert.equal(one('PostList').props.ignoreBlock, true);
    await act(async () => renderer?.unmount());
    renderer = null;
    await render(createEnvironment('new'));
    await respond(latestRequest('ProfileScreenQuery', 'new'), {
      currentSession: null,
      profileByHandle: profile,
    });
    assert.equal(all('PostList').length, 0);
    assert.equal(one('StateView').props.title, '차단한 프로필의 게시물입니다');
  });
  it('same-instance blur focus refreshes the single query', async () => {
    await render(createEnvironment());
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(),
    });
    const count = requests.length;
    await act(async () => {
      blurRoute();
      focusRoute();
    });
    assert.equal(requests.length, count + 1);
  });
  it('initial focus event does not duplicate the StrictMode request', async () => {
    await render(createEnvironment(), true);
    await act(async () => focusRoute());
    assert.equal(requests.length, 1);
  });
  it('same-frame blur focus reapplies own-block acknowledgement before the fresh response', async () => {
    const profile = {
      ...emptyPostsProfile(),
      viewerState: {
        ...emptyPostsProfile().viewerState,
        profileBlock: {
          __typename: 'ProfileBlock',
          id: 'block-1',
          targetProfile: {
            __typename: 'Profile',
            id: 'profile-target',
            displayName: 'Target',
            relativeHandle: '@target',
          },
        },
      },
    };
    await render(createEnvironment());
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: profile,
    });
    await act(async () => one('StateView').props.onAction());
    assert.equal(one('PostList').props.ignoreBlock, true);
    await act(async () => {
      blurRoute();
      focusRoute();
    });
    assert.equal(requests.length, 2);
    assert.equal(all('PostList').filter((n) => !n.props.loading).length, 0);
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: profile,
    });
    assert.equal(one('StateView').props.title, '차단한 프로필의 게시물입니다');
  });
  it('whole-screen error can fail again and recover through retry', async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      await render(createEnvironment());
      await fail(latestRequest('ProfileScreenQuery'));
      assert.equal(one('StateView').props.title, '프로필을 불러오지 못했어요');
      await act(async () => one('StateView').props.onAction());
      assert.equal(requests.length, 2);
      await fail(latestRequest('ProfileScreenQuery'));
      await act(async () => one('StateView').props.onAction());
      assert.equal(requests.length, 3);
      await respond(latestRequest('ProfileScreenQuery'), {
        currentSession: null,
        profileByHandle: emptyPostsProfile(),
      });
      assert.equal(one('PostList').props.profile.id, 'profile-target');
    } finally {
      console.error = original;
    }
  });
  for (const kind of ['followers', 'following']) {
    it(`${kind} selects its connection without posts`, async () => {
      routePath = `/@target/${kind}`;
      globalPath = '/@target';
      await render(createEnvironment());
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.variables.posts, false);
      assert.equal(requests[0]?.variables[kind], true);
      await respond(latestRequest('ProfileScreenQuery'), {
        profileByHandle: {
          ...blockedProfile(null),
          [kind]: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
        },
      });
      assert.equal(one('ProfileConnectionList').props.kind, kind);
      assert.equal(all('PostList').length, 0);
    });
  }

  it('mutual block 해제 뒤 normalized Profile의 own block이 사라지면 관계 action을 숨긴다', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(latestRequest('ProfileScreenQuery'), {
      currentSession: null,
      profileByHandle: {
        ...emptyPostsProfile(true),
        ...blockedProfile(
          {
            __typename: 'ProfileBlock',
            id: 'block-1',
            targetProfile: {
              __typename: 'Profile',
              id: 'profile-target',
              displayName: 'Target',
              relativeHandle: '@target',
            },
          },
          true,
        ),
      },
    });
    assert.deepEqual(readBlockState(environment), {
      blockedBy: true,
      profileBlockId: 'block-1',
    });

    await act(async () => button('차단 해제').props.onPress());
    await act(async () => one('ConfirmationContent').props.onConfirm());
    await respond(latestRequest('ProfileBlockActionUnblockMutation'), {
      unblockProfile: {
        success: true,
        profileBlockId: 'block-1',
        targetProfile: blockedProfile(null, true),
      },
    });

    assert.deepEqual(readBlockState(environment), {
      blockedBy: true,
      profileBlockId: undefined,
    });
    assert.deepEqual(
      all('Button').map((node) => node.props.children),
      [],
    );
  });
});
