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
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FetchPolicy, GraphQLResponse, Variables } from 'relay-runtime';
import type { PostRequestListSummary as PostRequestListSummaryComponent } from './PostRequestList';

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
mockModule('./PostRequestCard', {
  PostRequestCard: ({
    onCompose,
    onPublished,
    request,
  }: {
    onCompose?: () => void;
    onPublished?: (requestNodeId: string) => void;
    request: { id: string; requestId: string; status: string };
  }) =>
    createElement('PostRequestCard', {
      onCompose,
      onPublished,
      requestId: request.requestId,
      requestNodeId: request.id,
      status: request.status,
    }),
});

let renderer: ReactTestRenderer | null = null;
let PostRequestListSummary: typeof PostRequestListSummaryComponent;
const networkRequests: Array<{
  variables: Variables;
  respond: (response: GraphQLResponse) => void;
  complete: () => void;
}> = [];

const PROFILE_ID = 'profile-a';
const postRequestListQuery = generated('PostRequestListQuery');
const postRequestCardRefetchQuery = generated('PostRequestCardRefetchQuery');

before(async () => {
  ({ PostRequestListSummary } = await import('./PostRequestList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  networkRequests.length = 0;
  mock.restoreAll();
});

function createEnvironment() {
  return new Environment({
    network: Network.create((_operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        networkRequests.push({
          variables,
          respond: (response) => sink.next(response),
          complete: () => sink.complete(),
        });
      }),
    ),
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

function makeListPayload(requests: ReadonlyArray<RequestRow>, profileId = PROFILE_ID) {
  return {
    node: {
      __typename: 'Profile',
      id: profileId,
      postRequests: requests.map(makeRequestPayload),
    },
  };
}

function listOperation(profileId = PROFILE_ID) {
  return createOperationDescriptor(getRequest(postRequestListQuery), {
    profileId,
  });
}

function seedPostRequestLists(
  environment: Environment,
  requests: ReadonlyArray<RequestRow>,
  profileId = PROFILE_ID,
) {
  environment.commitPayload(listOperation(profileId), makeListPayload(requests, profileId));
}

function listRequestIds(environment: Environment, profileId = PROFILE_ID) {
  const snapshot = environment.lookup(listOperation(profileId).fragment);
  const data = snapshot.data as {
    node: { __typename: string; postRequests: ReadonlyArray<{ id: string }> } | null;
  };
  return data.node?.__typename === 'Profile'
    ? data.node.postRequests.map((request) => request.id)
    : [];
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

function summaryView(
  environment: Environment,
  queryOptions: Readonly<{ fetchKey?: string; fetchPolicy?: FetchPolicy }> = {},
  onCompose: () => void = () => undefined,
) {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(Suspense, {
      fallback: null,
      children: createElement(PostRequestListSummary, {
        ...queryOptions,
        onCompose,
        profileId: PROFILE_ID,
      }),
    }),
  });
}

async function renderSummary(
  environment: Environment,
  onCompose: () => void = () => undefined,
  queryOptions: Readonly<{ fetchKey?: string; fetchPolicy?: FetchPolicy }> = {},
) {
  await act(async () => {
    renderer = create(summaryView(environment, queryOptions, onCompose));
  });
  assert.ok(renderer);
}

function all(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

describe('Home post request cards', () => {
  it('renders every eligible request and excludes cancelled requests', async () => {
    const environment = createEnvironment();
    const requests = [
      makeRequest('request-failed', 'FAILED'),
      makeRequest('request-cancelled', 'CANCELLED'),
      makeRequest('request-queued', 'QUEUED'),
      makeRequest('request-processing', 'PROCESSING'),
      makeRequest('request-publishing', 'PUBLISHING'),
      makeRequest('request-confirming', 'CONFIRMING'),
    ];
    seedPostRequestLists(environment, requests);

    await renderSummary(environment);

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      [
        'request-failed',
        'request-queued',
        'request-processing',
        'request-publishing',
        'request-confirming',
      ],
    );
  });

  it('renders nothing when the Profile has no requests', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, []);

    await renderSummary(environment);

    assert.equal(renderer?.toJSON(), null);
  });

  it('renders nothing when only cancelled requests remain', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, [makeRequest('request-cancelled', 'CANCELLED')]);

    await renderSummary(environment);

    assert.equal(renderer?.toJSON(), null);
  });

  it('reuses a complete empty cache on re-entry and refreshes it with store-and-network', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, []);

    await renderSummary(environment);
    assert.equal(renderer?.toJSON(), null);
    assert.equal(networkRequests.length, 0);

    await act(async () => {
      renderer?.unmount();
      renderer = null;
    });
    await renderSummary(environment);
    assert.equal(renderer?.toJSON(), null);
    assert.equal(networkRequests.length, 0);

    await act(async () => {
      renderer?.update(
        summaryView(environment, {
          fetchKey: '0:1',
          fetchPolicy: 'store-and-network',
        }),
      );
    });

    assert.equal(networkRequests.length, 1);
    assert.deepEqual(networkRequests[0]?.variables, { profileId: PROFILE_ID });
    await act(async () => {
      networkRequests[0]?.respond({
        data: makeListPayload([makeRequest('request-from-another-device', 'QUEUED')]),
      });
      networkRequests[0]?.complete();
    });

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-from-another-device'],
    );
  });

  it('passes the shell compose action to failed requests', async () => {
    const environment = createEnvironment();
    seedPostRequestLists(environment, [makeRequest('request-a', 'FAILED')]);
    const onCompose = mock.fn();

    await renderSummary(environment, onCompose);

    assert.equal(all('PostRequestCard').length, 1);
    const card = all('PostRequestCard')[0];
    assert.ok(card);
    assert.equal(card.props.onCompose, onCompose);
    card.props.onCompose();
    assert.deepEqual(onCompose.mock.calls[0]?.arguments, []);
  });

  for (const testCase of [
    {
      label: 'with a Post projection',
      post: { id: 'post-a', profileId: 'profile-a' },
    },
    {
      label: 'without a Post projection',
      post: null,
    },
  ] as const) {
    it(`removes a polled PUBLISHED request without changing Home ${testCase.label}`, async () => {
      const environment = createEnvironment();
      const request = makeRequest('request-a', 'PROCESSING');
      const cancelledRequest = makeRequest('request-b', 'CANCELLED');
      seedPostRequestLists(environment, [request, cancelledRequest]);
      seedHomeConnection(environment, [
        { cursor: 'cursor-home-first-page', id: 'post-home-first-page' },
        { cursor: 'cursor-home-next-page', id: 'post-home-next-page' },
      ]);

      await renderSummary(environment);
      assert.equal(all('PostRequestCard').length, 1);

      await act(async () => {
        updateRequestStatus(environment, request, 'PUBLISHED', testCase.post);
      });
      const publishedCard = all('PostRequestCard')[0];
      assert.ok(publishedCard);
      assert.equal(publishedCard.props.status, 'PUBLISHED');
      const onPublished = publishedCard.props.onPublished as (requestNodeId: string) => void;
      await act(async () => {
        onPublished(request.id);
        onPublished(request.id);
      });

      assert.equal(all('PostRequestCard').length, 0);
      assert.equal(renderer?.toJSON(), null);
      assert.deepEqual(listRequestIds(environment), [cancelledRequest.id]);
      const homeConnectionId = ConnectionHandler.getConnectionID(
        'client:root',
        'PostList_homeTimeline',
      );
      assert.deepEqual(connectionNodeIds(environment, homeConnectionId), [
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
        ['cursor-home-first-page', 'cursor-home-next-page'],
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
  }

  it('does not infer Home Posts from retained FAILED and CANCELLED request history', async () => {
    const environment = createEnvironment();
    const requests = [
      makeRequest('request-failed', 'FAILED'),
      makeRequest('request-cancelled', 'CANCELLED'),
    ];
    seedPostRequestLists(environment, requests);
    seedHomeConnection(environment);

    await renderSummary(environment);

    assert.deepEqual(
      all('PostRequestCard').map((node) => node.props.requestId),
      ['request-failed'],
    );
    assert.deepEqual(
      listRequestIds(environment),
      requests.map((item) => item.id),
    );
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });

  it('hides a cancelled request from Home while retaining it in Profile history', async () => {
    const environment = createEnvironment();
    const request = makeRequest('request-a', 'PROCESSING');
    seedPostRequestLists(environment, [request]);
    seedHomeConnection(environment);

    await renderSummary(environment);
    assert.equal(all('PostRequestCard').length, 1);

    await act(async () => updateRequestStatus(environment, request, 'CANCELLED'));

    assert.equal(renderer?.toJSON(), null);
    assert.deepEqual(listRequestIds(environment), [request.id]);
    assert.deepEqual(
      connectionNodeIds(
        environment,
        ConnectionHandler.getConnectionID('client:root', 'PostList_homeTimeline'),
      ),
      [],
    );
  });
});
