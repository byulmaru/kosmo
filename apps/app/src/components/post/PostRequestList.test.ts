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
type InfiniteListMockProps = Readonly<{
  data: ReadonlyArray<{ id: string; requestId: string; status: string }>;
  empty?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  renderItem: (params: {
    index: number;
    item: { id: string; requestId: string; status: string };
  }) => ReactNode;
  [key: string]: unknown;
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
    onPublished,
    request,
  }: {
    onCancelled?: (result: { requestNodeId: string }) => void;
    onPublished?: (result: {
      authorProfileId: string;
      postId: string;
      requestNodeId: string;
    }) => void;
    request: { id: string; requestId: string; status: string };
  }) =>
    createElement('PostRequestCard', {
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

function makePagePayload(requests: ReadonlyArray<RequestRow>, nextPageToken: string | null = null) {
  return {
    postRequests: {
      __typename: 'PostRequestPage',
      nextPageToken,
      requests: requests.map(makeRequestPayload),
    },
  };
}

function listOperation(
  environment: Environment,
  statuses: readonly string[] | null,
  profileId = PROFILE_ID,
) {
  return createOperationDescriptor(getRequest(postRequestListQuery), {
    pageToken: null,
    profileId,
    statuses,
  });
}

function seedPostRequestPages(
  environment: Environment,
  requests: ReadonlyArray<RequestRow>,
  profileId = PROFILE_ID,
  nextPageToken: string | null = null,
) {
  environment.commitPayload(
    listOperation(environment, null, profileId),
    makePagePayload(requests, nextPageToken),
  );
  environment.commitPayload(
    listOperation(environment, HOME_STATUSES, profileId),
    makePagePayload(requests.filter((request) => HOME_STATUSES.includes(request.status as never))),
  );
}

function pageRequestIds(environment: Environment, statuses: readonly string[] | null) {
  const snapshot = environment.lookup(listOperation(environment, statuses).fragment);
  const data = snapshot.data as {
    postRequests: { requests: ReadonlyArray<{ id: string }> };
  };
  return data.postRequests.requests.map((request) => request.id);
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

async function renderSummary(environment: Environment) {
  const view = createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(Suspense, {
      fallback: null,
      children: createElement(PostRequestListSummary, {
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
  it('refetches the first page when the route retry fetch key changes', async () => {
    const request = makeRequest('request-a', 'FAILED');
    const requestedVariables: Record<string, unknown>[] = [];
    const environment = new Environment({
      network: Network.create((_operation, variables) =>
        Observable.create<GraphQLResponse>((sink) => {
          requestedVariables.push(variables);
          sink.next({ data: makePagePayload([request]) });
          sink.complete();
        }),
      ),
      store: new Store(new RecordSource()),
    });
    environment.commitPayload(listOperation(environment, null), makePagePayload([request]));

    await renderList(environment, { fetchKey: '0' });
    assert.deepEqual(requestedVariables, []);

    await updateList(environment, { fetchKey: '1' });

    assert.deepEqual(requestedVariables, [
      { pageToken: null, profileId: PROFILE_ID, statuses: null },
    ]);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-a'],
    );
  });

  it('loads the next page once, then keeps its rows when the returned token is null', async () => {
    const firstRequest = makeRequest('request-a', 'FAILED');
    const nextRequest = makeRequest('request-b', 'CANCELLED');
    const requestedVariables: Record<string, unknown>[] = [];
    const environment = new Environment({
      network: Network.create((_operation, variables) =>
        Observable.create<GraphQLResponse>((sink) => {
          requestedVariables.push(variables);
          sink.next({ data: makePagePayload([nextRequest]) });
          sink.complete();
        }),
      ),
      store: new Store(new RecordSource()),
    });
    environment.commitPayload(
      listOperation(environment, null),
      makePagePayload([firstRequest], 'next-token'),
    );
    environment.commitPayload(
      listOperation(environment, HOME_STATUSES),
      makePagePayload([firstRequest]),
    );

    await renderList(environment);

    let completion: Error | null | undefined;
    const requestNextPage = () => {
      const props = all('InfiniteList')[0]?.props;
      assert.ok(props);
      props.loadNext(20, { onComplete: (error: Error | null) => (completion = error) });
    };
    await act(async () => requestNextPage());

    assert.equal(completion, null);
    assert.deepEqual(requestedVariables, [
      { pageToken: 'next-token', profileId: PROFILE_ID, statuses: null },
    ]);
    assert.equal(all('InfiniteList')[0]?.props.hasNext, false);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-a', 'request-b'],
    );

    await act(async () => requestNextPage());

    assert.equal(requestedVariables.length, 1);
    assert.equal(all('InfiniteList')[0]?.props.hasNext, false);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-a', 'request-b'],
    );
  });

  it('keeps all loaded rows and the retry token when a later page fails', async () => {
    const firstRequest = makeRequest('request-a', 'FAILED');
    const nextRequest = makeRequest('request-b', 'CANCELLED');
    const environment = new Environment({
      network: Network.create((_operation, variables) =>
        Observable.create<GraphQLResponse>((sink) => {
          if (variables['pageToken'] === 'next-token') {
            sink.next({ data: makePagePayload([nextRequest], 'last-token') });
            sink.complete();
            return;
          }

          sink.error(new Error('Network unavailable'));
        }),
      ),
      store: new Store(new RecordSource()),
    });
    environment.commitPayload(
      listOperation(environment, null),
      makePagePayload([firstRequest], 'next-token'),
    );

    await renderList(environment);

    const loadNext = async () => {
      const props = all('InfiniteList')[0]?.props;
      assert.ok(props);
      let completion: Error | null | undefined;
      await act(async () =>
        props.loadNext(20, { onComplete: (error: Error | null) => (completion = error) }),
      );
      return completion;
    };

    assert.equal(await loadNext(), null);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-a', 'request-b'],
    );

    const error = await loadNext();

    assert.equal(error?.message, 'Network unavailable');
    assert.equal(all('InfiniteList')[0]?.props.hasNext, true);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-a', 'request-b'],
    );
  });

  it('disposes retained next-page requests when the profile or Relay environment changes and on unmount', async () => {
    let firstEnvironmentDisposals = 0;
    const firstEnvironment = new Environment({
      network: Network.create(() =>
        Observable.create<GraphQLResponse>(() => () => {
          firstEnvironmentDisposals += 1;
        }),
      ),
      store: new Store(new RecordSource()),
    });
    seedPostRequestPages(
      firstEnvironment,
      [makeRequest('request-a', 'FAILED')],
      PROFILE_ID,
      'token-a',
    );

    await renderList(firstEnvironment);
    const loadNext = async () => {
      const props = all('InfiniteList')[0]?.props;
      assert.ok(props);
      await act(async () => props.loadNext(20, { onComplete: () => undefined }));
    };

    await loadNext();
    assert.equal(firstEnvironmentDisposals, 0);

    seedPostRequestPages(
      firstEnvironment,
      [makeRequest('request-b', 'FAILED')],
      'profile-b',
      'token-b',
    );
    await updateList(firstEnvironment, { profileId: 'profile-b' });
    assert.equal(firstEnvironmentDisposals, 1);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-b'],
    );

    await loadNext();
    assert.equal(firstEnvironmentDisposals, 1);

    let secondEnvironmentDisposals = 0;
    const secondEnvironment = new Environment({
      network: Network.create(() =>
        Observable.create<GraphQLResponse>(() => () => {
          secondEnvironmentDisposals += 1;
        }),
      ),
      store: new Store(new RecordSource()),
    });
    seedPostRequestPages(
      secondEnvironment,
      [makeRequest('request-c', 'FAILED')],
      'profile-b',
      'token-c',
    );
    await updateList(secondEnvironment, { profileId: 'profile-b' });
    assert.equal(firstEnvironmentDisposals, 2);
    assert.deepEqual(
      (all('InfiniteList')[0]?.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-c'],
    );

    await loadNext();
    await act(async () => renderer?.unmount());
    renderer = null;
    assert.equal(secondEnvironmentDisposals, 1);
  });

  it('shows a focused request once above the remaining status history', async () => {
    const environment = createEnvironment();
    const requests = [makeRequest('request-a', 'FAILED'), makeRequest('request-b', 'CANCELLED')];
    seedPostRequestPages(environment, requests);
    const focused = makeRequestPayload(requests[0]!);

    await renderList(environment, {
      focusedRequestId: 'request-a',
      focusedRequest: focused as unknown as PostRequestCard_request$key,
    });

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-a', 'request-b'],
    );
    assert.deepEqual(
      (all('InfiniteList')[0]!.props.data as ReadonlyArray<{ requestId: string }>).map(
        ({ requestId }) => requestId,
      ),
      ['request-b'],
    );
  });

  it('uses the profile-scoped active root page for the Home summary', async () => {
    const environment = createEnvironment();
    seedPostRequestPages(environment, [
      makeRequest('request-a', 'CONFIRMING'),
      makeRequest('request-b', 'FAILED'),
    ]);

    await renderSummary(environment);

    assert.equal(all('PostRequestCard')[0]?.props.requestId, 'request-a');
    assert.deepEqual(pageRequestIds(environment, HOME_STATUSES), [
      'node:request-a',
      'node:request-b',
    ]);
  });

  it('moves a normalized published request into Home once when its author is the selected profile', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    seedPostRequestPages(environment, [request]);
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
    assert.deepEqual(pageRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(pageRequestIds(environment, null), [request.id]);
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
    seedPostRequestPages(environment, requests);
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
    assert.deepEqual(pageRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(
      pageRequestIds(environment, null),
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
    seedPostRequestPages(environment, [request]);
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
    assert.deepEqual(pageRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });

  it('prunes a cancelled request only from the Home first page after refetch confirms it', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    seedPostRequestPages(environment, [request]);
    seedHomeConnection(environment);

    await renderSummary(environment);
    assert.equal(all('PostRequestCard').length, 1);

    await act(async () => updateRequestStatus(environment, request, 'CANCELLED'));

    assert.equal(all('PostRequestCard').length, 0);
    assert.deepEqual(pageRequestIds(environment, HOME_STATUSES), []);
    assert.deepEqual(pageRequestIds(environment, null), [request.id]);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });
});
