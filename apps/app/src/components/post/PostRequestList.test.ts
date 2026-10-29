import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  commitLocalUpdate,
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRelayHandleKey,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestList_account$key } from './__generated__/PostRequestList_account.graphql';
import type {
  PostRequestList as PostRequestListComponent,
  PostRequestListSummary as PostRequestListSummaryComponent,
} from './PostRequestList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RequestNode = Readonly<{
  id: string;
  post: Readonly<{ id: string; profile: Readonly<{ id: string }> }> | null;
  requestId: string;
  status: string;
}>;
type Edge = Readonly<{ cursor: string; node: RequestNode }>;
type InfiniteListMockProps = Readonly<{
  data: ReadonlyArray<Edge>;
  empty?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  renderItem: (params: { index: number; item: Edge }) => ReactNode;
  [key: string]: unknown;
}>;
type PostRequestRow = Readonly<{
  id: string;
  post?: Readonly<{
    id: string;
    profileId: string;
    replyParent?: Readonly<{ id: string; replyCount: number }> | null;
  }> | null;
  requestId: string;
  status: string;
}>;

const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const generated = (name: string) =>
  require(`./__generated__/${name}.graphql.ts`).default as Parameters<typeof getRequest>[0];
const graphql = (parts: TemplateStringsArray) => {
  const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
  assert.ok(name, 'GraphQL documents must have an operation name');
  return generated(name);
};

mockModule('react-relay', { ...ReactRelay, graphql });
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/components/pagination/InfiniteList', {
  InfiniteList: ({ data, empty, footer, header, renderItem, ...props }: InfiniteListMockProps) =>
    createElement(
      'InfiniteList',
      { ...props, data },
      header,
      ...data.map((item, index) => renderItem({ index, item })),
      data.length === 0 ? empty : null,
      footer,
    ),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: () => () => undefined }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ accountId: 'account-a', selectedProfileId }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundSecondary: '#555', danger: '#900' }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'SUIT' },
  spacing: { lg: 16, md: 12, sm: 8, xxxl: 48 },
  typography: { sm: {} },
});
mockModule('./PostRequestCard', {
  PostRequestCard: ({
    activeConnectionId,
    onCancelled,
    onPublished,
    request,
  }: {
    activeConnectionId?: string;
    onCancelled?: (result: { requestNodeId: string }) => void;
    onPublished?: (result: {
      authorProfileId: string;
      postId: string;
      requestNodeId: string;
    }) => void;
    request: RequestNode;
  }) =>
    createElement('PostRequestCard', {
      activeConnectionId,
      onCancelled,
      onPublished,
      requestId: request.requestId,
      requestNodeId: request.id,
      status: request.status,
    }),
});

let renderer: ReactTestRenderer | null = null;
let PostRequestList: typeof PostRequestListComponent;
let PostRequestListSummary: typeof PostRequestListSummaryComponent;
let selectedProfileId = 'profile-a';

const ACCOUNT_ID = 'account-a';
const PROFILE_ID = 'profile-a';
const ACTIVE_STATUSES = ['CONFIRMING', 'FAILED', 'PROCESSING', 'PUBLISHING', 'QUEUED'] as const;
const postRequestListQuery = generated('PostRequestListNextPageQuery');
const postRequestCardRefetchQuery = generated('PostRequestCardRefetchQuery');

before(async () => {
  ({ PostRequestList, PostRequestListSummary } = await import('./PostRequestList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  selectedProfileId = 'profile-a';
  mock.restoreAll();
});

function createEnvironment() {
  return new Environment({
    network: Network.create(() => Observable.create<GraphQLResponse>(() => undefined)),
    store: new Store(new RecordSource()),
  });
}

function makeRequest(requestId: string, status: string): PostRequestRow {
  return { id: `node:${requestId}`, requestId, status };
}

function makeAccountPayload(requests: ReadonlyArray<PostRequestRow>) {
  return {
    node: {
      __typename: 'Account',
      id: ACCOUNT_ID,
      postRequests: {
        __typename: 'PostRequestConnection',
        edges: requests.map((request, index) => ({
          __typename: 'PostRequestConnectionEdge',
          cursor: `cursor:${index}`,
          node: {
            __typename: 'PostRequest',
            id: request.id,
            requestId: request.requestId,
            status: request.status,
            post: request.post
              ? {
                  __typename: 'Post',
                  id: request.post.id,
                  profile: {
                    __typename: 'Profile',
                    id: request.post.profileId,
                    relativeHandle: `@${request.post.profileId}`,
                  },
                }
              : null,
          },
        })),
        pageInfo: {
          __typename: 'PageInfo',
          endCursor: requests.length ? `cursor:${requests.length - 1}` : null,
          hasNextPage: false,
        },
      },
    },
  };
}

function seedPostRequestConnections(
  environment: Environment,
  requests: ReadonlyArray<PostRequestRow>,
) {
  const historyOperation = createOperationDescriptor(getRequest(postRequestListQuery), {
    id: ACCOUNT_ID,
    profileId: PROFILE_ID,
    statuses: null,
  });
  environment.commitPayload(historyOperation, makeAccountPayload(requests));

  const activeOperation = createOperationDescriptor(getRequest(postRequestListQuery), {
    id: ACCOUNT_ID,
    profileId: PROFILE_ID,
    statuses: ACTIVE_STATUSES,
  });
  environment.commitPayload(
    activeOperation,
    makeAccountPayload(
      requests.filter((request) => ACTIVE_STATUSES.includes(request.status as never)),
    ),
  );

  return historyOperation;
}

function accountKey(owner: ReturnType<typeof createOperationDescriptor>) {
  return {
    __id: ACCOUNT_ID,
    __fragments: { PostRequestList_account: { profileId: PROFILE_ID, statuses: null } },
    __fragmentOwner: owner.request,
  } as unknown as PostRequestList_account$key;
}

function seedHomeConnection(environment: Environment) {
  commitLocalUpdate(environment, (store) => {
    const root = store.getRoot();
    const connectionId = ConnectionHandler.getConnectionID(
      root.getDataID(),
      'PostList_homeTimeline',
    );
    const connection = store.create(connectionId, 'PostConnection');
    root.setLinkedRecord(
      connection,
      getRelayHandleKey('connection', 'PostList_homeTimeline', null),
    );
  });
}

function updateRequestStatus(
  environment: Environment,
  request: PostRequestRow,
  status: string,
  post?: PostRequestRow['post'],
) {
  const operation = createOperationDescriptor(getRequest(postRequestCardRefetchQuery), {
    id: request.id,
  });
  environment.commitPayload(operation, {
    node: {
      __typename: 'PostRequest',
      id: request.id,
      requestId: request.requestId,
      status,
      post: post
        ? {
            __typename: 'Post',
            id: post.id,
            profile: {
              __typename: 'Profile',
              id: post.profileId,
              relativeHandle: `@${post.profileId}`,
            },
            replyParent: post.replyParent
              ? {
                  __typename: 'Post',
                  id: post.replyParent.id,
                  replyCount: post.replyParent.replyCount,
                }
              : null,
          }
        : null,
    },
  });
}

function connectionNodeIds(environment: Environment, connectionId: string) {
  const source = environment.getStore().getSource();
  const connection = source.get(connectionId) as Record<string, unknown> | null;
  const edgeIds = (connection?.['edges'] as { __refs?: ReadonlyArray<string | null> } | undefined)
    ?.__refs;
  return (edgeIds ?? []).flatMap((edgeId) => {
    if (!edgeId) {
      return [];
    }
    const edge = source.get(edgeId) as Record<string, unknown> | null;
    const nodeId = (edge?.['node'] as { __ref?: string } | undefined)?.__ref;
    return nodeId ? [nodeId] : [];
  });
}

function connectionNodeIdsForRequestList(environment: Environment, active: boolean) {
  const connectionId = ConnectionHandler.getConnectionID(
    ACCOUNT_ID,
    'PostRequestList_postRequests',
    {
      profileId: PROFILE_ID,
      statuses: active ? ACTIVE_STATUSES : null,
    },
  );
  return connectionNodeIds(environment, connectionId);
}

async function renderList(
  environment: Environment,
  account: PostRequestList_account$key,
  overrides: Partial<Parameters<typeof PostRequestList>[0]> = {},
) {
  const view = createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(Suspense, {
      fallback: null,
      children: createElement(PostRequestList, {
        account,
        profileId: PROFILE_ID,
        ...overrides,
      }),
    }),
  });
  await act(async () => {
    renderer = create(view);
  });
  assert.ok(renderer);
}

async function renderSummary(environment: Environment, account: PostRequestList_account$key) {
  const view = createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(Suspense, {
      fallback: null,
      children: createElement(PostRequestListSummary, {
        account,
        onRewrite: () => undefined,
        profileId: PROFILE_ID,
      }),
    }),
  });
  await act(async () => {
    renderer = create(view);
  });
  assert.ok(renderer);
}

function all(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

describe('PostRequestList', () => {
  it('shows a focused request once above the remaining status history', async () => {
    const environment = createEnvironment();
    const requests = [makeRequest('request-a', 'FAILED'), makeRequest('request-b', 'CANCELLED')];
    const owner = seedPostRequestConnections(environment, requests);
    const focused = { ...requests[0]!, post: null };

    await renderList(environment, accountKey(owner), {
      focusedRequestId: 'request-a',
      focusedRequest: focused as unknown as PostRequestCard_request$key,
    });

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-a', 'request-b'],
    );
    assert.deepEqual(
      (all('InfiniteList')[0]!.props.data as ReadonlyArray<Edge>).map(({ node }) => node.requestId),
      ['request-b'],
    );
  });

  it('uses the profile-scoped active connection for the home summary card', async () => {
    const environment = createEnvironment();
    const owner = seedPostRequestConnections(environment, [
      makeRequest('request-a', 'CONFIRMING'),
      makeRequest('request-b', 'FAILED'),
    ]);

    await renderSummary(environment, accountKey(owner));

    assert.equal(all('PostRequestCard')[0]?.props.requestId, 'request-a');
    assert.equal(
      all('PostRequestCard')[0]?.props.activeConnectionId,
      ConnectionHandler.getConnectionID(ACCOUNT_ID, 'PostRequestList_postRequests', {
        profileId: PROFILE_ID,
        statuses: ACTIVE_STATUSES,
      }),
    );
  });

  it('moves a normalized published request into Home once when its author is the selected profile', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    const owner = seedPostRequestConnections(environment, [request]);
    seedHomeConnection(environment);

    await renderSummary(environment, accountKey(owner));
    assert.equal(all('PostRequestCard').length, 1);

    await act(async () => {
      updateRequestStatus(environment, request, 'PUBLISHED', {
        id: 'post-a',
        profileId: 'profile-a',
      });
    });
    await act(async () => {
      updateRequestStatus(environment, request, 'PUBLISHED', {
        id: 'post-a',
        profileId: 'profile-a',
      });
    });

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(connectionNodeIdsForRequestList(environment, true), []);
    assert.deepEqual(connectionNodeIdsForRequestList(environment, false), [request.id]);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      ['post-a'],
    );
  });

  it('handles first-seen terminal rechecks in Home while preserving history and reply counts', async () => {
    const environment = createEnvironment();
    const requests = [
      makeRequest('request-published-a', 'PROCESSING'),
      makeRequest('request-published-b', 'PROCESSING'),
      makeRequest('request-cancelled', 'PROCESSING'),
    ];
    const owner = seedPostRequestConnections(environment, requests);
    seedHomeConnection(environment);

    updateRequestStatus(environment, requests[0]!, 'PUBLISHED', {
      id: 'post-a',
      profileId: 'profile-a',
      replyParent: { id: 'parent-post', replyCount: 4 },
    });
    updateRequestStatus(environment, requests[1]!, 'PUBLISHED', {
      id: 'post-b',
      profileId: 'profile-b',
    });
    updateRequestStatus(environment, requests[2]!, 'CANCELLED');

    await renderSummary(environment, accountKey(owner));

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(connectionNodeIdsForRequestList(environment, true), []);
    assert.deepEqual(
      connectionNodeIdsForRequestList(environment, false),
      requests.map(({ id }) => id),
    );
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      ['post-a'],
    );
    assert.equal(
      (environment.getStore().getSource().get('parent-post') as Record<string, unknown> | null)?.[
        'replyCount'
      ],
      4,
    );

    await act(async () => {
      updateRequestStatus(environment, requests[0]!, 'PUBLISHED', {
        id: 'post-a',
        profileId: 'profile-a',
        replyParent: { id: 'parent-post', replyCount: 4 },
      });
    });

    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      ['post-a'],
    );
  });

  it('removes a published request from the active connection without inserting another profile’s post', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    const owner = seedPostRequestConnections(environment, [request]);
    seedHomeConnection(environment);
    selectedProfileId = 'profile-a';

    await renderSummary(environment, accountKey(owner));
    await act(async () => {
      updateRequestStatus(environment, request, 'PUBLISHED', {
        id: 'post-b',
        profileId: 'profile-b',
      });
    });

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(connectionNodeIdsForRequestList(environment, true), []);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });

  it('cleans the active connection after a cancelled request is confirmed by refetch', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    const owner = seedPostRequestConnections(environment, [request]);
    seedHomeConnection(environment);

    await renderSummary(environment, accountKey(owner));
    assert.equal(all('PostRequestCard').length, 1);

    await act(async () => updateRequestStatus(environment, request, 'CANCELLED'));

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(connectionNodeIdsForRequestList(environment, true), []);
    assert.deepEqual(connectionNodeIdsForRequestList(environment, false), [request.id]);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });
});
