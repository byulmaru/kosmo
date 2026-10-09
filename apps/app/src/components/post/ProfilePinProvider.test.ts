import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  commitMutation,
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import pinMutation from './__generated__/ProfilePinProviderPinProfilePostMutation.graphql';
import unpinMutation from './__generated__/ProfilePinProviderUnpinProfilePostMutation.graphql';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { useProfilePin as useProfilePinType } from './ProfilePinProvider';

const profileId = 'profile-pin-owner';
const existingPostId = 'post-pin-existing';
const targetPostId = 'post-pin-target';
const nextPostId = 'post-pin-next';
const connectionId = ConnectionHandler.getConnectionID(profileId, 'PostList_profile__pinnedPosts');
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const requests: Array<{
  name: string;
  sink: { next(response: GraphQLResponse): void; complete(): void; error(error: Error): void };
  variables: Variables;
}> = [];
const toasts: string[] = [];
let renderer: ReactTestRenderer | null = null;
let useProfilePin: typeof useProfilePinType;
let ProfilePinProvider: (props: { children?: ReactNode }) => ReactNode;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => () => undefined,
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'profile-pin-test-actor',
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string) => {
      toasts.push(message);
      return () => undefined;
    },
  }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: profileId }),
});

before(async () => {
  const { RelayFailOpenBoundary } = await import('../RelayFailOpenBoundary');
  mockModule('@/components/RelayFailOpenBoundary', { RelayFailOpenBoundary });
  ({ ProfilePinProvider, useProfilePin } = await import('./ProfilePinProvider'));
});

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  requests.length = 0;
  toasts.length = 0;
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
});

function createEnvironment() {
  return new Environment({
    network: Network.create((request: RequestParameters, variables: Variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: request.name, sink, variables });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function ProfilePinState({ label }: { label: string }) {
  const state = useProfilePin();
  return createElement('ProfilePinState', { label, ...state });
}

function Harness() {
  return createElement(
    'Cards',
    null,
    createElement(ProfilePinState, { label: 'A' }),
    createElement(ProfilePinState, { label: 'B' }),
  );
}

async function renderProvider() {
  const environment = createEnvironment();
  await act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        children: createElement(
          Suspense,
          { fallback: createElement('Loading') },
          createElement(ProfilePinProvider, null, createElement(Harness)),
        ),
        environment,
      }),
    );
  });
  assert.deepEqual(
    requests.map((request) => request.name),
    ['ProfilePinProviderQuery'],
  );
  await respond({
    data: {
      node: {
        __typename: 'Profile',
        id: profileId,
        pinnedPosts: {
          edges: [],
        },
      },
    },
  });
}

function states(): ReactTestInstance[] {
  assert.ok(renderer);
  const result = renderer.root.findAll((node) => String(node.type) === 'ProfilePinState');
  assert.equal(result.length, 2);
  return result;
}

async function respond(response: GraphQLResponse) {
  const request = requests.at(-1);
  assert.ok(request);
  await act(async () => {
    request.sink.next(response);
    request.sink.complete();
  });
}

async function failLatestRequest(message: string) {
  const request = requests.at(-1);
  assert.ok(request);
  await act(async () => {
    request.sink.error(new Error(message));
  });
}

function mutationResponse(field: 'pinProfilePost' | 'unpinProfilePost', postId: string | null) {
  const node = postId
    ? {
        __typename: 'Post',
        id: postId,
        createdAt: '2026-09-30T00:00:00.000Z',
        content: null,
        profile: {
          __typename: 'Profile',
          id: profileId,
          avatar: null,
          displayName: 'Pin owner',
          handle: 'pin-owner',
          relativeHandle: '@pin-owner',
          instance: { kind: 'LOCAL' },
          viewerState: null,
        },
        replyParent: null,
        repostSource: null,
        state: 'ACTIVE',
        visibility: 'PUBLIC',
        repostCount: 0,
        viewerBookmark: null,
        viewerRepost: null,
        viewerReactions: [],
        reactionCounts: [],
      }
    : null;
  return {
    data: {
      [field]: {
        changed: true,
        profile: {
          __typename: 'Profile',
          id: profileId,
          pinnedPosts: {
            edges: node ? [{ cursor: 'pin-cursor', node }] : [],
            pageInfo: {
              endCursor: null,
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: null,
            },
          },
        },
      },
    },
  };
}

describe('ProfilePinProvider owner lifecycle', () => {
  it('exposes a retry after the profile query fails and restores pin state', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    const environment = createEnvironment();
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          children: createElement(
            Suspense,
            { fallback: createElement('Loading') },
            createElement(ProfilePinProvider, null, createElement(Harness)),
          ),
          environment,
        }),
      );
    });
    assert.deepEqual(
      requests.map((request) => request.name),
      ['ProfilePinProviderQuery'],
    );

    await failLatestRequest('profile pin query failed');
    assert.equal(states()[0]?.props.queryFailed, true);
    assert.equal(states()[0]?.props.available, false);

    await act(async () => {
      states()[0]?.props.retry();
      await Promise.resolve();
    });
    assert.deepEqual(
      requests.map((request) => request.name),
      ['ProfilePinProviderQuery', 'ProfilePinProviderQuery'],
    );
    await respond({
      data: {
        node: {
          __typename: 'Profile',
          id: profileId,
          pinnedPosts: { edges: [] },
        },
      },
    });
    await act(async () => Promise.resolve());
    assert.equal(states()[0]?.props.queryFailed, false);
    assert.equal(states()[0]?.props.available, true);
  });

  it('reads selected profile pins once and shares pending across cards', async () => {
    await renderProvider();
    assert.equal(states()[0]?.props.available, true);
    assert.equal(states()[0]?.props.firstPinnedPostId, null);
    await act(async () => states()[0]?.props.request({ kind: 'pin', postId: targetPostId }));
    assert.deepEqual(
      requests.map((request) => request.name),
      ['ProfilePinProviderQuery', 'ProfilePinProviderPinProfilePostMutation'],
    );
    assert.equal(states()[0]?.props.pending, true);
    assert.equal(states()[1]?.props.pending, true);
    await act(async () => states()[1]?.props.request({ kind: 'pin', postId: existingPostId }));
    assert.equal(requests.length, 2);
    await respond(mutationResponse('pinProfilePost', targetPostId));
    assert.equal(states()[0]?.props.pending, false);
    assert.equal(states()[0]?.props.firstPinnedPostId, targetPostId);
  });

  it('runs direct unpin and reports a durable completion', async () => {
    await renderProvider();
    let completed = 0;
    await act(async () =>
      states()[0]?.props.request({
        kind: 'unpin',
        onCompleted: () => {
          completed += 1;
        },
        postId: existingPostId,
      }),
    );
    assert.equal(requests.at(-1)?.name, 'ProfilePinProviderUnpinProfilePostMutation');
    await respond(mutationResponse('unpinProfilePost', null));
    assert.equal(completed, 1);
    assert.deepEqual(toasts, []);
  });

  it('unpins before pinning a replacement and reports the partial failure', async () => {
    await renderProvider();
    await act(async () =>
      states()[0]?.props.request({
        existingPostId,
        kind: 'replace',
        postId: targetPostId,
      }),
    );
    assert.equal(requests.at(-1)?.name, 'ProfilePinProviderUnpinProfilePostMutation');
    await respond(mutationResponse('unpinProfilePost', null));
    assert.equal(requests.at(-1)?.name, 'ProfilePinProviderPinProfilePostMutation');
    assert.equal(states()[0]?.props.pending, true);
    await respond({
      data: { pinProfilePost: null },
      errors: [{ message: 'pin failed', path: ['pinProfilePost'] }],
    });
    assert.equal(states()[0]?.props.pending, false);
    assert.deepEqual(toasts, [
      '기존 고정은 해제됐지만 새 게시글을 고정하지 못했어요. 다시 시도해 주세요.',
    ]);
  });
});

function createCacheEnvironment() {
  const source = new RecordSource();
  const firstEdgeId = `${connectionId}-edge-first`;
  const nextEdgeId = `${connectionId}-edge-next`;
  const pageInfoId = `${connectionId}-pageInfo`;
  source.set(profileId, { __id: profileId, __typename: 'Profile', id: profileId });
  source.set(existingPostId, { __id: existingPostId, __typename: 'Post', id: existingPostId });
  source.set(connectionId, {
    __id: connectionId,
    __typename: 'PostConnection',
    __connection_next_edge_index: 2,
    edges: { __refs: [firstEdgeId, nextEdgeId] },
    pageInfo: { __ref: pageInfoId },
  });
  source.set(pageInfoId, {
    __id: pageInfoId,
    __typename: 'PageInfo',
    hasNextPage: false,
  });
  source.set(firstEdgeId, {
    __id: firstEdgeId,
    __typename: 'PostEdge',
    node: { __ref: existingPostId },
  });
  source.set(nextEdgeId, {
    __id: nextEdgeId,
    __typename: 'PostEdge',
    node: { __ref: nextPostId },
  });
  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

function connectionEdges(environment: Environment) {
  return environment.getStore().getSource().get(connectionId)?.edges;
}

describe('ProfilePinProvider Relay cache contract', () => {
  it('keeps server ordered pins and normalizes the next visible post', () => {
    const environment = createCacheEnvironment();
    const operation = createOperationDescriptor(getRequest(unpinMutation), {
      postId: existingPostId,
    });

    environment.commitPayload(operation, {
      unpinProfilePost: {
        changed: true,
        profile: {
          __typename: 'Profile',
          id: profileId,
          pinnedPosts: {
            __typename: 'PostConnection',
            edges: [
              {
                __typename: 'PostEdge',
                cursor: 'next-cursor',
                node: {
                  __typename: 'Post',
                  id: nextPostId,
                  createdAt: '2026-09-30T00:00:00.000Z',
                  content: null,
                  profile: {
                    __typename: 'Profile',
                    id: profileId,
                    avatar: null,
                    displayName: 'Pin owner',
                    handle: 'pin-owner',
                    relativeHandle: '@pin-owner',
                    instance: { kind: 'LOCAL' },
                    viewerState: null,
                  },
                  replyParent: null,
                  repostSource: null,
                  state: 'ACTIVE',
                  visibility: 'PUBLIC',
                  repostCount: 0,
                  viewerBookmark: null,
                  viewerRepost: null,
                  viewerReactions: [],
                  reactionCounts: [],
                },
              },
            ],
            pageInfo: {
              __typename: 'PageInfo',
              endCursor: 'next-cursor',
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: 'next-cursor',
            },
          },
        },
      },
    });

    const edges = connectionEdges(environment);
    assert.equal(edges?.__refs?.length, 1);
    const nextEdge = environment
      .getStore()
      .getSource()
      .get(edges?.__refs?.[0] ?? '');
    assert.deepEqual(nextEdge?.node, { __ref: nextPostId });
    assert.ok(environment.getStore().getSource().get(nextPostId));
    assert.equal(environment.getStore().getSource().get(existingPostId)?.id, existingPostId);
  });

  it('keeps the existing connection when a pin response has GraphQL errors', async () => {
    const environment = new Environment({
      network: Network.create(() =>
        Promise.resolve({
          data: { pinProfilePost: null },
          errors: [{ message: 'pin failed', path: ['pinProfilePost', 'profile'] }],
        }),
      ),
      store: createCacheEnvironment().getStore(),
    });
    const errors = await new Promise<ReadonlyArray<{ message: string }> | null | undefined>(
      (resolve, reject) => {
        commitMutation(environment, {
          mutation: pinMutation,
          onCompleted: (_response, completedErrors) => resolve(completedErrors),
          onError: reject,
          variables: { postId: nextPostId },
        });
      },
    );

    assert.equal(errors?.[0]?.message, 'pin failed');
    assert.deepEqual(connectionEdges(environment), {
      __refs: [`${connectionId}-edge-first`, `${connectionId}-edge-next`],
    });
  });
});
