import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, StrictMode, useEffect } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode, Ref } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
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
let activeFocusEffect: (() => void | (() => void)) | undefined;
let activeFocusCleanup: (() => void) | undefined;
let routeFocused = true;

function useFocusEffect(effect: () => void | (() => void)) {
  useEffect(() => {
    activeFocusEffect = effect;
    if (routeFocused) {
      activeFocusCleanup = effect() ?? undefined;
    }

    return () => {
      activeFocusCleanup?.();
      activeFocusCleanup = undefined;
      if (activeFocusEffect === effect) {
        activeFocusEffect = undefined;
      }
    };
  }, [effect]);
}

function blurRoute() {
  routeFocused = false;
  activeFocusCleanup?.();
  activeFocusCleanup = undefined;
}

function focusRoute() {
  routeFocused = true;
  activeFocusCleanup = activeFocusEffect?.() ?? undefined;
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    if (name === 'ProfileLayoutQuery') {
      return require(`./__generated__/${name}.graphql.ts`).default;
    }
    if (
      name === 'ProfileFollowersPageQuery' ||
      name === 'ProfileFollowingPageQuery' ||
      name === 'ProfilePostListPageQuery'
    ) {
      return require(`../../app/(tabs)/(profile)/[profileHandle]/__generated__/${name}.graphql.ts`)
        .default;
    }
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
  useFocusEffect,
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
  activeFocusEffect = undefined;
  activeFocusCleanup = undefined;
  routeFocused = true;
});

function createEnvironment(environmentId = 'default') {
  return new Environment({
    network: Network.create((operation) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ environmentId, name: operation.name, sink });
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
  it('StrictMode effect replay keeps the posts preload consumable', async () => {
    const environment = createEnvironment();
    await render(environment, true);

    const postRequests = requests.filter(({ name }) => name === 'ProfilePostListPageQuery');
    const layoutRequests = requests.filter(({ name }) => name === 'ProfileLayoutQuery');
    assert.equal(postRequests.length, 1);
    assert.ok(layoutRequests.length >= 1);
    assert.equal(requests[0]?.name, 'ProfileLayoutQuery');

    for (const request of postRequests) {
      await respond(request, {
        currentSession: null,
        profileByHandle: emptyPostsProfile(),
      });
    }
    for (const request of layoutRequests) {
      await respond(request, { profileByHandle: blockedProfile(null) });
    }

    assert.equal(one('PostList').props.loading, undefined);
    assert.ok(one('PostList').props.profile);
  });

  it('same-mounted Native blur disposes posts and focus starts a fresh posts request', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(),
    });
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(null),
    });

    const initialPostRequestCount = requests.filter(
      ({ name }) => name === 'ProfilePostListPageQuery',
    ).length;
    const initialLayoutRequestCount = requests.filter(
      ({ name }) => name === 'ProfileLayoutQuery',
    ).length;

    await act(async () => blurRoute());
    assert.equal(
      requests.filter(({ name }) => name === 'ProfilePostListPageQuery').length,
      initialPostRequestCount,
    );

    await act(async () => focusRoute());
    assert.equal(
      requests.filter(({ name }) => name === 'ProfilePostListPageQuery').length,
      initialPostRequestCount + 1,
    );
    assert.equal(
      requests.filter(({ name }) => name === 'ProfileLayoutQuery').length,
      initialLayoutRequestCount,
    );
    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(),
    });
    assert.ok(one('PostList').props.profile);
  });

  it('retained posts error recovers after blur and focus loads a successful reference', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const environment = createEnvironment();
      await render(environment);
      await fail(latestRequest('ProfilePostListPageQuery'));
      await respond(latestRequest('ProfileLayoutQuery'), {
        profileByHandle: blockedProfile(null),
      });
      assert.equal(one('PostList').props.error, true);

      await act(async () => {
        blurRoute();
        focusRoute();
      });
      await respond(latestRequest('ProfilePostListPageQuery'), {
        currentSession: null,
        profileByHandle: emptyPostsProfile(),
      });

      assert.equal(one('PostList').props.error, undefined);
      assert.ok(one('PostList').props.profile);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('layout이 pending이어도 posts 요청을 시작하고 layout gate를 우회하지 않는다', async () => {
    const environment = createEnvironment();
    await render(environment);

    assert.deepEqual(
      requests.map(({ name }) => name),
      ['ProfileLayoutQuery', 'ProfilePostListPageQuery'],
    );
    assert.equal(one('ProfileHero').props.loading, true);

    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: null,
    });
    assert.equal(one('ProfileHero').props.loading, true);

    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(null),
    });
    assert.equal(one('PageHeader').props.title, 'Target');
    assert.equal(one('PostList').props.loading, undefined);
  });

  it('posts leaf 오류 retry는 layout 요청을 다시 시작하지 않는다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const environment = createEnvironment();
      await render(environment);
      await fail(latestRequest('ProfilePostListPageQuery'));
      await respond(latestRequest('ProfileLayoutQuery'), {
        profileByHandle: blockedProfile(null),
      });

      assert.equal(one('PostList').props.error, true);
      const layoutRequestCount = requests.filter(
        ({ name }) => name === 'ProfileLayoutQuery',
      ).length;
      await act(async () => one('PostList').props.onRetry());

      assert.equal(
        requests.filter(({ name }) => name === 'ProfileLayoutQuery').length,
        layoutRequestCount,
      );
      await respond(latestRequest('ProfilePostListPageQuery'), {
        currentSession: null,
        profileByHandle: emptyPostsProfile(),
      });
      assert.equal(one('PostList').props.error, undefined);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('cold·warm·partial cache에서도 store-and-network route 요청 수를 분리한다', async () => {
    const environment = createEnvironment();
    await render(environment);
    assert.deepEqual(
      requests.map(({ name }) => name),
      ['ProfileLayoutQuery', 'ProfilePostListPageQuery'],
    );
    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: null,
    });
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(null),
    });
    await act(async () => renderer?.unmount());
    renderer = null;

    await render(environment);
    assert.equal(requests.filter(({ name }) => name === 'ProfileLayoutQuery').length, 2);
    assert.equal(requests.filter(({ name }) => name === 'ProfilePostListPageQuery').length, 2);

    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(),
    });
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(null),
    });
    await act(async () => renderer?.unmount());
    renderer = null;

    await render(environment);
    assert.equal(requests.filter(({ name }) => name === 'ProfileLayoutQuery').length, 3);
    assert.equal(requests.filter(({ name }) => name === 'ProfilePostListPageQuery').length, 3);
  });

  it('이전 handle의 늦은 응답은 새 Profile 결과를 노출하지 않는다', async () => {
    const environment = createEnvironment();
    await render(environment);
    const oldLayout = latestRequest('ProfileLayoutQuery');
    const oldPosts = latestRequest('ProfilePostListPageQuery');

    routeHandle = '@other';
    routePath = '/@other';
    await act(async () => {
      renderer?.update(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: createElement(ProfileLayout),
        }),
      );
    });
    const nextLayout = latestRequest('ProfileLayoutQuery');
    const nextPosts = latestRequest('ProfilePostListPageQuery');
    await respond(oldPosts, { currentSession: null, profileByHandle: null });
    await respond(oldLayout, { profileByHandle: blockedProfile(null) });
    assert.equal(all('PostList').length, 0);
    assert.equal(one('PageHeader').props.title, '');

    await respond(nextPosts, { currentSession: null, profileByHandle: null });
    await respond(nextLayout, {
      profileByHandle: { ...blockedProfile(null), displayName: 'Other' },
    });
    assert.equal(one('PageHeader').props.title, 'Other');
  });

  it('actor remount 뒤 이전 actor 응답은 새 Store를 변경하지 않는다', async () => {
    const oldEnvironment = createEnvironment('old-actor');
    await render(oldEnvironment);
    const oldLayout = latestRequest('ProfileLayoutQuery', 'old-actor');
    const oldPosts = latestRequest('ProfilePostListPageQuery', 'old-actor');
    await act(async () => renderer?.unmount());
    renderer = null;

    const newEnvironment = createEnvironment('new-actor');
    await render(newEnvironment);
    const newLayout = latestRequest('ProfileLayoutQuery', 'new-actor');
    const newPosts = latestRequest('ProfilePostListPageQuery', 'new-actor');
    await respond(oldPosts, { currentSession: null, profileByHandle: null });
    await respond(oldLayout, { profileByHandle: { ...blockedProfile(null), displayName: 'Old' } });
    assert.equal(all('PostList').length, 0);
    assert.equal(one('PageHeader').props.title, '');

    await respond(newPosts, { currentSession: null, profileByHandle: null });
    await respond(newLayout, {
      profileByHandle: { ...blockedProfile(null), displayName: 'New' },
    });
    assert.equal(one('PageHeader').props.title, 'New');
  });

  it('missing Profile은 posts 결과가 있어도 목록을 gating한다', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: null,
    });
    await respond(latestRequest('ProfileLayoutQuery'), { profileByHandle: null });

    assert.equal(all('PostList').length, 0);
    assert.equal(one('StateView').props.title, '프로필을 찾을 수 없어요');
  });

  it('blockedBy Profile은 posts 결과가 있어도 차단 상태를 유지한다', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(latestRequest('ProfilePostListPageQuery'), {
      currentSession: null,
      profileByHandle: emptyPostsProfile(true),
    });
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(null, true),
    });

    assert.equal(all('PostList').length, 0);
    assert.equal(one('StateView').props.title, '이 프로필을 볼 수 없습니다');
  });

  it('followers 진입은 layout만 요청하고 posts를 prefetch하지 않는다', async () => {
    routePath = '/@target/followers';
    const environment = createEnvironment();
    await render(environment);
    assert.deepEqual(
      requests.map(({ name }) => name),
      ['ProfileLayoutQuery'],
    );
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(null),
    });
    assert.equal(
      requests.some(({ name }) => name === 'ProfilePostListPageQuery'),
      false,
    );
  });

  it('router pathname이 잠시 profile home이어도 following child는 posts를 prefetch하지 않는다', async () => {
    routePath = '/@target/following';
    globalPath = '/@target';
    const environment = createEnvironment();
    await render(environment);

    assert.deepEqual(
      requests.map(({ name }) => name),
      ['ProfileLayoutQuery'],
    );
  });

  it('mutual block 해제 뒤 normalized Profile의 own block이 사라지면 관계 action을 숨긴다', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(latestRequest('ProfileLayoutQuery'), {
      profileByHandle: blockedProfile(
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
