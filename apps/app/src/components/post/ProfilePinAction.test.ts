import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
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
import pinMutation from './__generated__/ProfilePinActionPinProfilePostMutation.graphql';
import unpinMutation from './__generated__/ProfilePinActionUnpinProfilePostMutation.graphql';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { ProfilePinActionPinProfilePostMutation } from './__generated__/ProfilePinActionPinProfilePostMutation.graphql';
import type { useProfilePinAction as useProfilePinActionType } from './ProfilePinAction';

const profileId = 'profile-pin-owner';
const firstPostId = 'post-pin-first';
const nextPostId = 'post-pin-next';
const connectionId = ConnectionHandler.getConnectionID(profileId, 'PostList_profile__pinnedPosts');
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const requests: Array<{
  sink: { next(response: GraphQLResponse): void; complete(): void };
}> = [];
const toasts: string[] = [];
let renderer: ReactTestRenderer | null = null;
let useProfilePinAction: typeof useProfilePinActionType;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-relay', {
  ...ReactRelay,
  RelayEnvironmentProvider: ReactRelay.RelayEnvironmentProvider,
  useMutation: ReactRelay.useMutation,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule('lucide-react-native', { Pin: 'Pin' });
mockModule(require.resolve('lucide-react-native'), { Pin: 'Pin' });
mockModule('react-native', { Platform: { OS: 'web' } });
const sessionMock = {
  useSession: () => ({ selectedProfileId: profileId, sessionId: 'session-pin' }),
};
const toastMock = {
  useToast: () => ({
    showToast: (message: string) => {
      toasts.push(message);
      return () => undefined;
    },
  }),
};
mockModule('@/session/SessionProvider', sessionMock);
mockModule('@/components/ui/ToastProvider', toastMock);
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ConfirmationContent', props, children),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});

before(async () => {
  ({ useProfilePinAction } = await import('./ProfilePinAction'));
});

beforeEach(() => {
  requests.length = 0;
  toasts.length = 0;
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

function createActionEnvironment() {
  return new Environment({
    network: Network.create(() =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function ActionHarness({
  onUnpinned,
  post,
}: {
  onUnpinned?: () => void;
  post: object;
}) {
  const action = useProfilePinAction(post as never, onUnpinned);
  return createElement('ActionState', action, action.confirmation);
}

const actionPost = {
  id: 'post-pin-action',
  state: 'ACTIVE',
  visibility: 'PUBLIC',
  content: { id: 'content-pin-action' },
  repostSource: null,
  profile: {
    id: profileId,
    instance: { kind: 'LOCAL' },
    pinnedPosts: { edges: [] },
  },
};

async function renderAction(
  environment: Environment,
  firstPinnedPostId: string | null = null,
  onUnpinned?: () => void,
) {
  await act(async () => {
    renderer = create(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        environment,
        children: createElement(ActionHarness, {
          onUnpinned,
          post: {
            ...actionPost,
            profile: {
              ...actionPost.profile,
              pinnedPosts: {
                edges: firstPinnedPostId ? [{ node: { id: firstPinnedPostId } }] : [],
              },
            },
          },
        }),
      }),
    );
  });
}

function actionState(): ReactTestInstance {
  assert.ok(renderer);
  const state = renderer.root.findAll((node) => String(node.type) === 'ActionState')[0];
  assert.ok(state);
  return state;
}

async function respondAction(response: GraphQLResponse) {
  const request = requests.at(-1);
  assert.ok(request);
  await act(async () => {
    request.sink.next(response);
    request.sink.complete();
  });
}

function modal(): ReactTestInstance {
  assert.ok(renderer);
  const instance = renderer.root.findAll((node) => String(node.type) === 'ModalSheet')[0];
  assert.ok(instance);
  return instance;
}

function confirmation(): ReactTestInstance {
  assert.ok(renderer);
  const instance = renderer.root.findAll((node) => String(node.type) === 'ConfirmationContent')[0];
  assert.ok(instance);
  return instance;
}

describe('ProfilePinAction mutation lifecycle', () => {
  it('confirms pin before starting a request and restores focus after cancel', async () => {
    const environment = createActionEnvironment();
    await renderAction(environment);

    let focusCount = 0;
    actionState().props.onMoreTriggerReady(() => {
      focusCount += 1;
    });
    await act(async () => actionState().props.item.onSelect());
    assert.equal(requests.length, 0);
    assert.equal(modal().props.title, '프로필에 고정할까요?');
    assert.equal(confirmation().props.confirmLabel, '고정');
    await act(async () => confirmation().props.onCancel());
    assert.equal(requests.length, 0);
    await act(async () => modal().props.onDismiss());
    assert.equal(focusCount, 1);

    await act(async () => actionState().props.item.onSelect());
    await act(async () => confirmation().props.onConfirm());
    await act(async () => confirmation().props.onConfirm());
    assert.equal(requests.length, 0);
    assert.equal(modal().props.visible, false);
    await act(async () => modal().props.onDismiss());
    assert.equal(requests.length, 1);
    assert.equal(actionState().props.pending, true);

    await respondAction({
      data: {
        pinProfilePost: {
          changed: false,
          profile: {
            __typename: 'Profile',
            id: profileId,
            pinnedPosts: {
              __typename: 'PostConnection',
              edges: [
                {
                  __typename: 'PostEdge',
                  cursor: 'pin-cursor',
                  node: {
                    __typename: 'Post',
                    id: firstPostId,
                    viewerBookmark: null,
                  },
                },
              ],
              pageInfo: {
                __typename: 'PageInfo',
                endCursor: null,
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
              },
            },
          },
        },
      },
      errors: [
        {
          message: 'optional avatar projection failed',
          path: ['pinProfilePost', 'profile', 'pinnedPosts', 'edges', 0, 'node', 'viewerBookmark'],
        },
      ],
    });

    assert.equal(actionState().props.pending, false);
    assert.deepEqual(toasts, []);
  });

  it('hides a new pin when another post is the first visible pin', async () => {
    const environment = createActionEnvironment();
    await renderAction(environment, firstPostId);

    assert.equal(actionState().props.item, undefined);
    await act(async () => actionState().props.onMoreTriggerReady(() => undefined));
    assert.equal(requests.length, 0);
  });

  it('skips a stale empty edge when deriving the first visible pin', async () => {
    const environment = createActionEnvironment();
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: createElement(ActionHarness, {
            post: {
              ...actionPost,
              profile: {
                ...actionPost.profile,
                pinnedPosts: { edges: [{ node: null }, { node: { id: actionPost.id } }] },
              },
            },
          }),
        }),
      );
    });

    assert.equal(actionState().props.item.label, '프로필 고정 해제');
  });

  it('blocks another pin using the first non-empty edge after a stale edge', async () => {
    const environment = createActionEnvironment();
    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: createElement(ActionHarness, {
            post: {
              ...actionPost,
              profile: {
                ...actionPost.profile,
                pinnedPosts: { edges: [{ node: null }, { node: { id: firstPostId } }] },
              },
            },
          }),
        }),
      );
    });

    assert.equal(actionState().props.item, undefined);
  });

  it('closes unpin confirmation before the request and allows a confirmed retry', async () => {
    const environment = createActionEnvironment();
    let unpinned = 0;
    await renderAction(environment, actionPost.id, () => {
      unpinned += 1;
    });

    await act(async () => actionState().props.item.onSelect());
    assert.equal(modal().props.title, '프로필 고정을 해제할까요?');
    assert.equal(confirmation().props.confirmLabel, '고정 해제');
    assert.equal(
      confirmation().props.message,
      '프로필 상단에서 이 게시글을 제거해요. 게시글은 삭제되지 않아요.',
    );
    assert.equal(requests.length, 0);
    await act(async () => confirmation().props.onConfirm());
    await act(async () => confirmation().props.onConfirm());
    assert.equal(requests.length, 0);
    await act(async () => modal().props.onDismiss());
    assert.equal(requests.length, 1);
    await respondAction({
      data: { unpinProfilePost: null },
      errors: [{ message: 'unpin failed', path: ['unpinProfilePost'] }],
    });

    assert.equal(actionState().props.pending, false);
    assert.deepEqual(toasts, ['고정 상태를 변경하지 못했어요. 다시 시도해 주세요.']);
    assert.equal(actionState().props.confirmation, null);
    await act(async () => actionState().props.item.onSelect());
    await act(async () => confirmation().props.onConfirm());
    await act(async () => modal().props.onDismiss());
    assert.equal(actionState().props.pending, true);
    assert.equal(requests.length, 2);
    await respondAction({
      data: {
        unpinProfilePost: {
          changed: true,
          profile: {
            id: profileId,
            pinnedPosts: {
              edges: [],
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
    });
    assert.equal(unpinned, 1);
    assert.equal(actionState().props.confirmation, null);
  });
});

function createEnvironment() {
  const source = new RecordSource();
  const firstEdgeId = `${connectionId}-edge-first`;
  const nextEdgeId = `${connectionId}-edge-next`;
  const pageInfoId = `${connectionId}-pageInfo`;
  source.set(profileId, { __id: profileId, __typename: 'Profile', id: profileId });
  source.set(firstPostId, { __id: firstPostId, __typename: 'Post', id: firstPostId });
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
    node: { __ref: firstPostId },
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

function createMutationEnvironment(response: GraphQLResponse) {
  const seeded = createEnvironment();
  return new Environment({
    network: Network.create(() => Promise.resolve(response)),
    store: seeded.getStore(),
  });
}

function connectionEdges(environment: Environment) {
  return environment.getStore().getSource().get(connectionId)?.edges;
}

describe('ProfilePinAction Relay cache contract', () => {
  it('keeps the server ordered pin connection and normalizes the next visible Post', () => {
    const environment = createEnvironment();
    const operation = createOperationDescriptor(getRequest(unpinMutation), { postId: firstPostId });

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
    assert.equal(environment.getStore().getSource().get(firstPostId)?.id, firstPostId);
  });

  it('keeps the existing connection when the network response has GraphQL errors', async () => {
    const environment = createMutationEnvironment({
      data: { pinProfilePost: null },
      errors: [{ message: 'pin failed', path: ['pinProfilePost', 'profile'] }],
    });
    const errors = await new Promise<ReadonlyArray<{ message: string }> | null | undefined>(
      (resolve, reject) => {
        commitMutation<ProfilePinActionPinProfilePostMutation>(environment, {
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
