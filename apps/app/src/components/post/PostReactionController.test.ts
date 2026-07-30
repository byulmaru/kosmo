import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitMutation } from 'react-relay';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import AddReactionMutation from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import DeleteReactionMutation from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';
import type { PostReactionControllerAddReactionMutation } from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import type { PostReactionControllerDeleteReactionMutation } from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';

const postId = 'post-content';

type NetworkSink = {
  complete(): void;
  next(payload: unknown): void;
};

function createEnvironment() {
  const source = new RecordSource({
    'count-eyes': {
      __id: 'count-eyes',
      __typename: 'ReactionCount',
      count: 1,
      type: 'EYES',
    },
    'count-heart': {
      __id: 'count-heart',
      __typename: 'ReactionCount',
      count: 1,
      type: 'HEART',
    },
    'reaction-eyes': {
      __id: 'reaction-eyes',
      __typename: 'Reaction',
      id: 'reaction-eyes',
      type: 'EYES',
    },
    'reaction-heart': {
      __id: 'reaction-heart',
      __typename: 'Reaction',
      id: 'reaction-heart',
      type: 'HEART',
    },
    [postId]: {
      __id: postId,
      __typename: 'Post',
      id: postId,
      reactionCounts: { __refs: ['count-heart', 'count-eyes'] },
      viewerReactions: { __refs: ['reaction-heart', 'reaction-eyes'] },
    },
  });

  let sink: NetworkSink | undefined;
  const environment = new Environment({
    network: Network.create(() =>
      Observable.create((nextSink) => {
        sink = nextSink;
      }),
    ),
    store: new Store(source),
  });

  return {
    environment,
    respond(payload: unknown) {
      assert.ok(sink, 'commitMutation must subscribe to the Relay network');
      sink.next(payload);
      sink.complete();
    },
  };
}

function viewerReactionIds(environment: Environment) {
  return environment.getStore().getSource().get(postId)?.viewerReactions?.__refs;
}

function reactionCounts(environment: Environment) {
  const source = environment.getStore().getSource();
  const refs = source.get(postId)?.reactionCounts?.__refs ?? [];
  return refs.map((id: string) => {
    const record = source.get(id);
    return { count: record?.count, type: record?.type };
  });
}

function commitAdd(
  environment: Environment,
  respond: (payload: unknown) => void,
  payload: unknown,
  errors?: ReadonlyArray<{ message: string }>,
) {
  return new Promise<void>((resolve, reject) => {
    commitMutation<PostReactionControllerAddReactionMutation>(environment, {
      mutation: AddReactionMutation,
      onCompleted: () => resolve(),
      onError: reject,
      variables: { postId, type: 'PARTY' },
    });
    respond({ data: payload, ...(errors ? { errors } : {}) });
  });
}

function commitDelete(
  environment: Environment,
  respond: (payload: unknown) => void,
  payload: unknown,
) {
  return new Promise<void>((resolve, reject) => {
    commitMutation<PostReactionControllerDeleteReactionMutation>(environment, {
      mutation: DeleteReactionMutation,
      onCompleted: () => resolve(),
      onError: reject,
      variables: { postId, type: 'HEART' },
    });
    respond({ data: payload });
  });
}

const addPayload = {
  addReaction: {
    post: {
      __typename: 'Post',
      id: postId,
      reactionCounts: [
        { __typename: 'ReactionCount', count: 1, type: 'EYES' },
        { __typename: 'ReactionCount', count: 1, type: 'PARTY' },
      ],
      viewerReactions: [
        { __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' },
        { __typename: 'Reaction', id: 'reaction-party', type: 'PARTY' },
      ],
    },
    reaction: { __typename: 'Reaction', id: 'reaction-party', type: 'PARTY' },
  },
};

describe('PostReactionController Relay cache contract', () => {
  it('normalizes the authoritative viewer state, count, and server order after add', async () => {
    const { environment, respond } = createEnvironment();

    await commitAdd(environment, respond, addPayload);

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes', 'reaction-party']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'EYES' },
      { count: 1, type: 'PARTY' },
    ]);
  });

  it('keeps an idempotent add payload free of duplicate plural links', async () => {
    const { environment, respond } = createEnvironment();

    await commitAdd(environment, respond, addPayload);
    await commitAdd(environment, respond, addPayload);

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes', 'reaction-party']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'EYES' },
      { count: 1, type: 'PARTY' },
    ]);
  });

  it('normalizes useful add data when GraphQL errors are also present', async () => {
    const { environment, respond } = createEnvironment();

    await commitAdd(environment, respond, addPayload, [{ message: 'partial GraphQL error' }]);

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes', 'reaction-party']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'EYES' },
      { count: 1, type: 'PARTY' },
    ]);
  });

  it('normalizes an authoritative delete Post even when reactionId is null', async () => {
    const { environment, respond } = createEnvironment();

    await commitDelete(environment, respond, {
      deleteReaction: {
        post: {
          __typename: 'Post',
          id: postId,
          reactionCounts: [{ __typename: 'ReactionCount', count: 1, type: 'EYES' }],
          viewerReactions: [{ __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' }],
        },
        reactionId: null,
      },
    });

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [{ count: 1, type: 'EYES' }]);
  });

  it('does not guess viewer state or counts when delete returns no Post', async () => {
    const { environment, respond } = createEnvironment();

    await commitDelete(environment, respond, {
      deleteReaction: { post: null, reactionId: null },
    });

    assert.deepEqual(viewerReactionIds(environment), ['reaction-heart', 'reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
    ]);
  });

  it('uses the re-add payload order after a Type reaches zero and reappears', async () => {
    const { environment, respond } = createEnvironment();

    await commitDelete(environment, respond, {
      deleteReaction: {
        post: {
          __typename: 'Post',
          id: postId,
          reactionCounts: [{ __typename: 'ReactionCount', count: 1, type: 'EYES' }],
          viewerReactions: [{ __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' }],
        },
        reactionId: 'reaction-heart',
      },
    });
    await commitAdd(environment, respond, {
      addReaction: {
        post: {
          __typename: 'Post',
          id: postId,
          reactionCounts: [
            { __typename: 'ReactionCount', count: 1, type: 'EYES' },
            { __typename: 'ReactionCount', count: 1, type: 'HEART' },
          ],
          viewerReactions: [
            { __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' },
            { __typename: 'Reaction', id: 'reaction-heart-new', type: 'HEART' },
          ],
        },
        reaction: { __typename: 'Reaction', id: 'reaction-heart-new', type: 'HEART' },
      },
    });

    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'EYES' },
      { count: 1, type: 'HEART' },
    ]);
  });

  it('keeps mutation normalization isolated to the request actor Store', async () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();

    await commitAdd(actorA.environment, actorA.respond, addPayload);

    assert.deepEqual(viewerReactionIds(actorA.environment), ['reaction-eyes', 'reaction-party']);
    assert.deepEqual(viewerReactionIds(actorB.environment), ['reaction-heart', 'reaction-eyes']);
    assert.deepEqual(reactionCounts(actorB.environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
    ]);
  });
});
