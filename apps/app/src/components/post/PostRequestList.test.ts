import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, Fragment, Suspense } from 'react';
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
import { POST_REQUEST_HOME_ACTIVE_STATUSES } from './postRequestCache';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type {
  PostRequestList as PostRequestListComponent,
  PostRequestListSummary as PostRequestListSummaryComponent,
} from './PostRequestList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RequestRow = Readonly<{
  id: string;
  post: Readonly<{
    id: string;
    profileId: string;
    replyParent?: Readonly<{ id: string; replyCount: number }> | null;
  }> | null;
  requestId: string;
  status: string;
}>;
type FlatListMockProps = Readonly<{
  data: ReadonlyArray<{ id: string; requestId: string; status: string }>;
  ListEmptyComponent?: ReactNode;
  ListHeaderComponent?: ReactNode;
  renderItem: (params: {
    index: number;
    item: { id: string; requestId: string; status: string };
  }) => ReactNode;
  [key: string]: unknown;
}>;

const require = createRequire(import.meta.url);
const platform = { OS: 'ios' };
let hasPaginationScrollParent = false;
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
  FlatList: ({
    data,
    ListEmptyComponent,
    ListHeaderComponent,
    renderItem,
    ...props
  }: FlatListMockProps) =>
    createElement(
      'FlatList',
      { ...props, data },
      ListHeaderComponent,
      ...(data.length === 0
        ? [ListEmptyComponent]
        : data.map((item, index) =>
            createElement(Fragment, { key: item.id }, renderItem({ index, item })),
          )),
    ),
  Platform: platform,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/components/pagination/PaginationScrollView', {
  usePaginationScrollContext: () => hasPaginationScrollParent,
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId }),
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
    onCancelled,
    onCompose,
    onPublished,
    request,
  }: {
    onCancelled?: (result: { requestNodeId: string }) => void;
    onCompose?: () => void;
    onPublished?: (result: {
      authorProfileId: string;
      postId: string;
      requestNodeId: string;
    }) => void;
    request: { id: string; requestId: string; status: string };
  }) =>
    createElement('PostRequestCard', {
      onCancelled,
      onCompose,
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

const PROFILE_ID = 'profile-a';
const HOME_STATUSES = POST_REQUEST_HOME_ACTIVE_STATUSES;
const postRequestListQuery = generated('PostRequestListQuery');
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
  hasPaginationScrollParent = false;
  platform.OS = 'ios';
  mock.restoreAll();
});

function createEnvironment() {
  return new Environment({
    network: Network.create(() => Observable.create<GraphQLResponse>(() => undefined)),
    store: new Store(new RecordSource()),
  });
}

function makeRequest(requestId: string, status: string): RequestRow {
  return { id: `node:${requestId}`, post: null, requestId, status };
}

function makeRequestPayload(request: RequestRow) {
  return {
    __typename: 'PostRequest',
    authorProfile: {
      __typename: 'Profile',
      avatar: null,
      displayName: '작성자',
      handle: '@writer',
      id: 'profile-writer',
      relativeHandle: '@writer',
    },
    bodyText: `본문 ${request.requestId}`,
    contentWarning: null,
    id: request.id,
    media: [],
    post: request.post
      ? {
          __typename: 'Post',
          content: { __typename: 'PostContent', id: `content:${request.post.id}` },
          id: request.post.id,
          profile: {
            __typename: 'Profile',
            avatar: null,
            displayName: '작성자',
            handle: `@${request.post.profileId}`,
            id: request.post.profileId,
            relativeHandle: `@${request.post.profileId}`,
          },
          replyParent: request.post.replyParent
            ? {
                __typename: 'Post',
                id: request.post.replyParent.id,
                profile: {
                  __typename: 'Profile',
                  displayName: '답글 대상',
                  id: `profile:${request.post.replyParent.id}`,
                },
                replyCount: request.post.replyParent.replyCount,
              }
            : null,
        }
      : null,
    requestId: request.requestId,
    sensitiveMedia: false,
    status: request.status,
  };
}

function makeListPayload(requests: ReadonlyArray<RequestRow>) {
  return { postRequests: requests.map(makeRequestPayload) };
}

function listOperation(statuses: readonly string[] | null, profileId = PROFILE_ID) {
  return createOperationDescriptor(getRequest(postRequestListQuery), {
    profileId,
    statuses,
  });
}

function seedPostRequestLists(
  environment: Environment,
  requests: ReadonlyArray<RequestRow>,
  profileId = PROFILE_ID,
) {
  environment.commitPayload(listOperation(null, profileId), makeListPayload(requests));
  environment.commitPayload(
    listOperation(HOME_STATUSES, profileId),
    makeListPayload(requests.filter((request) => HOME_STATUSES.includes(request.status as never))),
  );
}

function listRequestIds(
  environment: Environment,
  statuses: readonly string[] | null,
  profileId = PROFILE_ID,
) {
  const snapshot = environment.lookup(listOperation(statuses, profileId).fragment);
  const data = snapshot.data as { postRequests: ReadonlyArray<{ id: string }> };
  return data.postRequests.map((request) => request.id);
}

function seedHomeConnection(
  environment: Environment,
  existingPosts: ReadonlyArray<{ cursor: string; id: string }> = [],
) {
  commitLocalUpdate(environment, (store) => {
    const root = store.getRoot();
    const connectionId = ConnectionHandler.getConnectionID(
      root.getDataID(),
      'PostList_homeTimeline',
    );
    const connection = store.create(connectionId, 'PostConnection');
    if (existingPosts.length > 0) {
      const edges = existingPosts.map(({ cursor, id }) => {
        const post = store.create(id, 'Post');
        const edge = ConnectionHandler.createEdge(store, connection, post, 'PostConnectionEdge');
        edge.setValue(cursor, 'cursor');
        return edge;
      });
      connection.setLinkedRecords(edges, 'edges');

      const pageInfo = store.create('client:homeTimeline-pageInfo', 'PageInfo');
      pageInfo.setValue(existingPosts[0]?.cursor ?? null, 'startCursor');
      pageInfo.setValue(existingPosts[existingPosts.length - 1]?.cursor ?? null, 'endCursor');
      pageInfo.setValue(true, 'hasNextPage');
      pageInfo.setValue(false, 'hasPreviousPage');
      connection.setLinkedRecord(pageInfo, 'pageInfo');
    }
    root.setLinkedRecord(
      connection,
      getRelayHandleKey('connection', 'PostList_homeTimeline', null),
    );
  });
}

function updateRequestStatus(
  environment: Environment,
  request: RequestRow,
  status: string,
  post?: RequestRow['post'],
) {
  const operation = createOperationDescriptor(getRequest(postRequestCardRefetchQuery), {
    id: request.id,
  });
  environment.commitPayload(operation, {
    node: makeRequestPayload({ ...request, post: post ?? null, status }),
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

async function renderList(
  environment: Environment,
  overrides: Partial<Parameters<typeof PostRequestList>[0]> = {},
) {
  await act(async () => {
    renderer = create(listView(environment, overrides));
  });
  assert.ok(renderer);
}

function listView(
  environment: Environment,
  overrides: Partial<Parameters<typeof PostRequestList>[0]> = {},
) {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(Suspense, {
      fallback: null,
      children: createElement(PostRequestList, {
        profileId: PROFILE_ID,
        ...overrides,
      }),
    }),
  });
}

async function updateList(
  environment: Environment,
  overrides: Partial<Parameters<typeof PostRequestList>[0]> = {},
) {
  await act(async () => {
    renderer?.update(listView(environment, overrides));
  });
  assert.ok(renderer);
}

async function renderSummary(environment: Environment, onCompose: () => void = () => undefined) {
  const view = createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(Suspense, {
      fallback: null,
      children: createElement(PostRequestListSummary, {
        onCompose,
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
  it('refetches the full history when the route retry fetch key changes', async () => {
    const request = makeRequest('request-a', 'FAILED');
    const requestedVariables: Record<string, unknown>[] = [];
    const environment = new Environment({
      network: Network.create((_operation, variables) =>
        Observable.create<GraphQLResponse>((sink) => {
          requestedVariables.push(variables);
          sink.next({ data: makeListPayload([request]) });
          sink.complete();
        }),
      ),
      store: new Store(new RecordSource()),
    });
    environment.commitPayload(listOperation(null), makeListPayload([request]));

    await renderList(environment, { fetchKey: '0' });
    assert.deepEqual(requestedVariables, []);

    await updateList(environment, { fetchKey: '1' });

    assert.deepEqual(requestedVariables, [{ profileId: PROFILE_ID, statuses: null }]);
    assert.deepEqual(
      (all('FlatList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-a'],
    );
  });

  it('renders the complete history response beyond twenty rows in one native list', async () => {
    const requests = Array.from({ length: 25 }, (_, index) =>
      makeRequest(`request-${index + 1}`, 'FAILED'),
    );
    const environment = createEnvironment();
    seedPostRequestLists(environment, requests);

    await renderList(environment);

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      requests.map((request) => request.requestId),
    );
    assert.equal(all('FlatList')[0]?.props.data.length, requests.length);
  });

  it('renders request rows in document flow when a native parent scroll view exists', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, [
      makeRequest('request-a', 'FAILED'),
      makeRequest('request-b', 'CANCELLED'),
    ]);
    hasPaginationScrollParent = true;

    await renderList(environment);

    assert.equal(all('FlatList').length, 0);
    assert.equal(all('View').length, 1);
    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-a', 'request-b'],
    );
  });

  it('renders its header and all request cards in web document flow', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, [
      makeRequest('request-a', 'FAILED'),
      makeRequest('request-b', 'CANCELLED'),
    ]);
    platform.OS = 'web';

    await renderList(environment, { header: createElement('ListHeader') });

    assert.equal(all('FlatList').length, 0);
    assert.equal(all('ListHeader').length, 1);
    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-a', 'request-b'],
    );
  });

  it('shows the web empty state after its header when the history is empty', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, []);
    platform.OS = 'web';

    await renderList(environment, { header: createElement('ListHeader') });

    assert.equal(all('FlatList').length, 0);
    assert.equal(all('ListHeader').length, 1);
    assert.equal(all('StateView').length, 1);
  });

  it('shows the empty state under its header when the history is empty', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, []);

    await renderList(environment, { header: createElement('ListHeader') });

    assert.equal(all('FlatList').length, 1);
    assert.equal(all('ListHeader').length, 1);
    assert.equal(all('StateView').length, 1);
    assert.equal(all('PostRequestCard').length, 0);
  });

  it('keeps request history isolated by profile and Relay environment', async () => {
    const firstEnvironment = createEnvironment();
    seedPostRequestLists(firstEnvironment, [makeRequest('request-a', 'FAILED')]);

    await renderList(firstEnvironment);
    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-a'],
    );

    seedPostRequestLists(firstEnvironment, [makeRequest('request-b', 'FAILED')], 'profile-b');
    await updateList(firstEnvironment, { profileId: 'profile-b' });
    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-b'],
    );

    const secondEnvironment = createEnvironment();
    seedPostRequestLists(secondEnvironment, [makeRequest('request-c', 'FAILED')], 'profile-b');
    await updateList(secondEnvironment, { profileId: 'profile-b' });
    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-c'],
    );
  });

  it('shows a focused request once above the remaining status history', async () => {
    const environment = createEnvironment();
    const requests = [
      makeRequest('request-a', 'FAILED'),
      makeRequest('request-b', 'CANCELLED'),
      makeRequest('request-c', 'PUBLISHED'),
    ];
    seedPostRequestLists(environment, requests);
    const focused = makeRequestPayload(requests[0]!);

    await renderList(environment, {
      focusedRequestId: 'request-a',
      focusedRequest: focused as unknown as PostRequestCard_request$key,
    });

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-a', 'request-b', 'request-c'],
    );
    assert.deepEqual(
      (all('FlatList')[0]!.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-b', 'request-c'],
    );
  });

  it('uses the profile-scoped active root list for the Home summary', async () => {
    const environment = createEnvironment();
    const requests = [
      makeRequest('request-a', 'CONFIRMING'),
      makeRequest('request-b', 'FAILED'),
      makeRequest('request-c', 'CANCELLED'),
      makeRequest('request-d', 'PUBLISHED'),
    ];
    seedPostRequestLists(environment, requests);

    await renderSummary(environment);

    assert.equal(all('PostRequestCard')[0]?.props.requestId, 'request-a');
    assert.deepEqual(listRequestIds(environment, HOME_STATUSES), [
      'node:request-a',
      'node:request-b',
    ]);
    assert.deepEqual(
      listRequestIds(environment, null),
      requests.map((request) => request.id),
    );
  });

  it('passes the shell compose action to the failed request in the Home summary', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, [makeRequest('request-a', 'FAILED')]);
    const onCompose = mock.fn();

    await renderSummary(environment, onCompose);

    const card = all('PostRequestCard')[0];
    assert.ok(card);
    assert.equal(card.props.onCompose, onCompose);
    card.props.onCompose();
    assert.deepEqual(onCompose.mock.calls[0]?.arguments, []);
  });

  it('moves a normalized published request into Home once when its author is the selected profile', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    seedPostRequestLists(environment, [request]);
    seedHomeConnection(environment, [
      { cursor: 'cursor-home-first-page', id: 'post-home-first-page' },
      { cursor: 'cursor-home-next-page', id: 'post-home-next-page' },
    ]);

    await renderSummary(environment);
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
    assert.deepEqual(listRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(listRequestIds(environment, null), [request.id]);
    const homeConnectionId = ConnectionHandler.getConnectionID(
      'client:root',
      'PostList_homeTimeline',
    );
    assert.deepEqual(connectionNodeIds(environment, homeConnectionId), [
      'post-a',
      'post-home-first-page',
      'post-home-next-page',
    ]);

    const source = environment.getStore().getSource();
    const connection = source.get(homeConnectionId) as Record<string, unknown> | null;
    assert.ok(connection);
    const edgeIds = (connection['edges'] as { __refs?: ReadonlyArray<string | null> } | undefined)
      ?.__refs;
    assert.ok(edgeIds);
    assert.deepEqual(
      edgeIds.map((edgeId) => (edgeId ? source.get(edgeId)?.['cursor'] : null)),
      [null, 'cursor-home-first-page', 'cursor-home-next-page'],
    );

    const pageInfoId = (connection['pageInfo'] as { __ref?: string } | undefined)?.__ref;
    assert.ok(pageInfoId);
    const pageInfo = source.get(pageInfoId) as Record<string, unknown> | null;
    assert.ok(pageInfo);
    assert.deepEqual(
      {
        endCursor: pageInfo['endCursor'],
        hasNextPage: pageInfo['hasNextPage'],
        hasPreviousPage: pageInfo['hasPreviousPage'],
        startCursor: pageInfo['startCursor'],
      },
      {
        endCursor: 'cursor-home-next-page',
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'cursor-home-first-page',
      },
    );
  });

  it('reconciles first-seen terminal requests in Home while preserving history and reply counts', async () => {
    const environment = createEnvironment();
    const requests = [
      makeRequest('request-published-a', 'PROCESSING'),
      makeRequest('request-published-b', 'PROCESSING'),
      makeRequest('request-cancelled', 'PROCESSING'),
    ];
    seedPostRequestLists(environment, requests);
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

    await renderSummary(environment);

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(listRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(
      listRequestIds(environment, null),
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

  it('removes a published request from Home without inserting another profile’s Post', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    seedPostRequestLists(environment, [request]);
    seedHomeConnection(environment);
    selectedProfileId = 'profile-a';

    await renderSummary(environment);
    await act(async () => {
      updateRequestStatus(environment, request, 'PUBLISHED', {
        id: 'post-b',
        profileId: 'profile-b',
      });
    });

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(listRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });

  it('prunes a cancelled request only from the Home list after refetch confirms it', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    seedPostRequestLists(environment, [request]);
    seedHomeConnection(environment);

    await renderSummary(environment);
    assert.equal(all('PostRequestCard').length, 1);

    await act(async () => updateRequestStatus(environment, request, 'CANCELLED'));

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(listRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(listRequestIds(environment, null), [request.id]);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });
});
