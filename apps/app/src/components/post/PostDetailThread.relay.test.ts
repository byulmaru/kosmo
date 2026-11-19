import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createOperationDescriptor,
  createReaderSelector,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import { post, profile } from '@/stories/fixtures';
import PostDetailConversationFragment from './__generated__/PostDetailConversation_post.graphql';
import PostDetailConversationQuery from './__generated__/PostDetailConversationNextPageQuery.graphql';
import PostDetailThreadQuery from './__generated__/PostDetailThreadNextPageQuery.graphql';
import type { GraphQLResponse } from 'relay-runtime';

const current = post({ id: 'post-current', profile: profile({ id: 'profile-current' }) });
const firstReply = post({ id: 'post-first-reply', profile: current.profile });
const secondReply = post({ id: 'post-second-reply', profile: current.profile });

function createEnvironment() {
  return new Environment({
    network: Network.create(() =>
      Observable.create<GraphQLResponse>((sink) => {
        sink.complete();
        return () => undefined;
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function relayPost(value: typeof current) {
  return { ...value, url: null, viewerReactions: [] };
}

function nodePayload(
  descendants: Array<typeof firstReply>,
  pageInfo: { endCursor: string | null; hasNextPage: boolean },
) {
  return {
    node: {
      ...relayPost(current),
      replyAncestors: [],
      replyDescendants: {
        edges: descendants.map((node, index) => ({
          cursor: `reply-cursor-${index}`,
          node: relayPost(node),
        })),
        pageInfo,
      },
    },
  };
}

function descendantIds(snapshot: { data: unknown }) {
  const data = snapshot.data as {
    replyDescendants?: { edges?: Array<{ node?: { id: string } | null }> } | null;
  };
  return (data.replyDescendants?.edges ?? []).flatMap((edge) => (edge.node ? [edge.node.id] : []));
}

describe('Post detail shared Relay connection', () => {
  it('viewer refetch updates a subscribed route fragment through the shared connection', () => {
    const environment = createEnvironment();
    const variables = { count: 20, cursor: null, id: current.id };
    const routeOperation = createOperationDescriptor(PostDetailConversationQuery, variables);
    environment.commitPayload(
      routeOperation,
      nodePayload([firstReply], { endCursor: 'reply-cursor-0', hasNextPage: true }),
    );

    const routeSelector = createReaderSelector(
      PostDetailConversationFragment,
      current.id,
      variables,
      routeOperation.request,
    );
    const routeSnapshot = environment.lookup(routeSelector);
    let routeDescendantIds = descendantIds(routeSnapshot);
    assert.deepEqual(routeDescendantIds, ['post-first-reply']);
    const subscription = environment.subscribe(routeSnapshot, (nextSnapshot) => {
      routeDescendantIds = descendantIds(nextSnapshot);
    });

    environment.commitPayload(
      createOperationDescriptor(PostDetailThreadQuery, variables),
      nodePayload([firstReply, secondReply], {
        endCursor: 'reply-cursor-1',
        hasNextPage: false,
      }),
    );
    subscription.dispose();

    assert.deepEqual(routeDescendantIds, ['post-first-reply', 'post-second-reply']);
  });
});
