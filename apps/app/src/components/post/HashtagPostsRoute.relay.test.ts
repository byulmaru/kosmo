import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, Variables } from 'relay-runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const requests: Request[] = [];
const routeParams: { hashtagId: string | undefined } = { hashtagId: undefined };
let renderer: ReactTestRenderer | null = null;
let HashtagPostsScreen: ComponentType;

type Request = {
  name: string;
  variables: Variables;
  fail: (error: Error) => void;
  respond: (data: object) => void;
};

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(
      `../../app/(tabs)/(profile)/hashtags/[hashtagId]/__generated__/${name}.graphql.ts`,
    ).default;
  },
});
mockModule('expo-router', {
  useLocalSearchParams: () => routeParams,
  useRouter: () => ({ back: () => undefined, canGoBack: () => false, replace: () => undefined }),
});
mockModule('lucide-react-native', { ArrowLeftIcon: 'ArrowLeftIcon' });
mockModule(require.resolve('lucide-react-native'), { ArrowLeftIcon: 'ArrowLeftIcon' });
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
});
mockModule('@/components/PageHeader', {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule('@/components/post/PostList', {
  PostList: (props: object) => createElement('PostList', props),
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('IconButton', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: '#111111' }),
});
mockModule('@/theme/tokens', { spacing: { sm: 8 } });

before(async () => {
  ({ default: HashtagPostsScreen } =
    await import('../../app/(tabs)/(profile)/hashtags/[hashtagId]/posts'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  routeParams.hashtagId = undefined;
  requests.length = 0;
});

function createEnvironment() {
  return new Environment({
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({
          name: operation.name,
          variables,
          fail: (error) => sink.error(error),
          respond: (data) => {
            sink.next({ data });
            sink.complete();
          },
        });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function tree(environment: Environment) {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(HashtagPostsScreen),
  });
}

async function mount(environment: Environment, hashtagId: string | undefined) {
  routeParams.hashtagId = hashtagId;
  await act(async () => {
    renderer = create(tree(environment));
  });
}

async function update(environment: Environment, hashtagId: string | undefined) {
  routeParams.hashtagId = hashtagId;
  await act(async () => renderer?.update(tree(environment)));
}

function all(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function one(type: string): ReactTestInstance {
  const matches = all(type);
  assert.equal(matches.length, 1, `Expected one ${type}`);
  return matches[0]!;
}

function pageHeader() {
  return one('PageHeader');
}

function postList() {
  return one('PostList');
}

async function respond(request: Request, data: object) {
  await act(async () => request.respond(data));
}

function hashtagPayload(id: string, name: string) {
  return {
    currentSession: { id: 'session-guest', selectedProfile: null },
    node: {
      __typename: 'Hashtag',
      id,
      name,
      posts: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
    },
  };
}

describe('public hashtag posts route with real Relay', () => {
  it('loads a guest hashtag by its Global ID and passes the hashtag connection to PostList', async () => {
    const environment = createEnvironment();
    const hashtagId = 'SGFzaHRhZzo5NTA2M2Q4OC0wN2VlLTRhMGUtYjJjNS03ZjU4Y2Q0MDk4ZWQ=';

    await mount(environment, hashtagId);

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.name, 'HashtagPostsPageQuery');
    assert.deepEqual(requests[0]?.variables, { id: hashtagId });
    assert.equal(pageHeader().props.title, '게시글');
    assert.equal(postList().props.loading, true);

    await respond(requests[0]!, hashtagPayload(hashtagId, '바다'));

    assert.equal(pageHeader().props.title, '#바다');
    assert.equal(postList().props.loading, undefined);
    assert.equal(postList().props.error, undefined);
    assert.equal(postList().props.hashtag.__id, hashtagId);
    assert.equal(postList().props.identityKey, `hashtag:${hashtagId}:guest`);
    assert.equal(postList().props.replyProfile, null);
  });

  it('shows the PostList retry after a query error and recovers the requested hashtag', async () => {
    const environment = createEnvironment();
    const hashtagId = 'SGFzaHRhZzo5NTA2M2Q4OC0wN2VlLTRhMGUtYjJjNS03ZjU4Y2Q0MDk4ZWQ=';
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await mount(environment, hashtagId);
      await act(async () => requests[0]?.fail(new Error('query failed')));

      assert.equal(postList().props.error, true);
      assert.equal(typeof postList().props.onRetry, 'function');

      await act(async () => postList().props.onRetry());
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1]?.variables, { id: hashtagId });

      await respond(requests[1]!, hashtagPayload(hashtagId, '다시 만난 바다'));
      assert.equal(pageHeader().props.title, '#다시 만난 바다');
      assert.equal(postList().props.identityKey, `hashtag:${hashtagId}:guest`);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('shows not found for a missing route parameter, a missing node, or a different node type', async () => {
    const noIdEnvironment = createEnvironment();
    await mount(noIdEnvironment, undefined);
    assert.equal(requests.length, 0);
    assert.equal(pageHeader().props.title, '게시글');
    assert.equal(one('StateView').props.title, '해시태그를 찾을 수 없어요');
    assert.equal(all('PostList').length, 0);
    await act(async () => renderer?.unmount());
    renderer = null;

    for (const node of [null, { __typename: 'Profile', id: 'profile-1' }]) {
      const environment = createEnvironment();
      const hashtagId = 'SGFzaHRhZzo5NTA2M2Q4OC0wN2VlLTRhMGUtYjJjNS03ZjU4Y2Q0MDk4ZWQ=';
      await mount(environment, hashtagId);
      await respond(requests[0]!, {
        currentSession: { id: 'session-guest', selectedProfile: null },
        node,
      });

      assert.equal(pageHeader().props.title, '게시글');
      assert.equal(one('StateView').props.title, '해시태그를 찾을 수 없어요');
      assert.equal(all('PostList').length, 0);
      await act(async () => renderer?.unmount());
      renderer = null;
      requests.length = 0;
    }
  });

  it('changes node identity with the route and ignores an earlier hashtag response', async () => {
    const environment = createEnvironment();
    const firstHashtagId = 'SGFzaHRhZzo5NTA2M2Q4OC0wN2VlLTRhMGUtYjJjNS03ZjU4Y2Q0MDk4ZWQ=';
    const secondHashtagId = 'SGFzaHRhZjo3NzY2YjA5My01N2E2LTQ2Y2YtOTg5OS1hMGQ0MGYxM2E5YmM=';

    await mount(environment, firstHashtagId);
    const firstRequest = requests[0]!;
    assert.deepEqual(firstRequest.variables, { id: firstHashtagId });

    await update(environment, secondHashtagId);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1]?.variables, { id: secondHashtagId });

    await respond(requests[1]!, hashtagPayload(secondHashtagId, '두 번째'));
    assert.equal(pageHeader().props.title, '#두 번째');
    assert.equal(postList().props.hashtag.__id, secondHashtagId);
    assert.equal(postList().props.identityKey, `hashtag:${secondHashtagId}:guest`);

    await respond(firstRequest, hashtagPayload(firstHashtagId, '첫 번째'));
    assert.equal(pageHeader().props.title, '#두 번째');
    assert.equal(postList().props.hashtag.__id, secondHashtagId);
    assert.equal(postList().props.identityKey, `hashtag:${secondHashtagId}:guest`);
  });
});
