import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitMutation } from 'react-relay';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import AddReactionMutation from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import DeleteReactionMutation from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';
import {
  createReactionDeleteUpdater,
  createReactionOptimisticUpdater,
} from './PostReactionController.optimistic';
import type { RecordSourceSelectorProxy } from 'relay-runtime';
import type { PostReactionControllerAddReactionMutation } from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import type { PostReactionControllerDeleteReactionMutation } from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';

const postId = 'post-content';

type NetworkSink = {
  complete(): void;
  error(error: unknown): void;
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

  const sinks: NetworkSink[] = [];
  const environment = new Environment({
    network: Network.create(() =>
      Observable.create((nextSink) => {
        sinks.push(nextSink);
      }),
    ),
    store: new Store(source),
  });

  return {
    environment,
    respond(payload: unknown) {
      const sink = sinks.shift();
      assert.ok(sink, 'commitMutation must subscribe to the Relay network');
      sink.next(payload);
      sink.complete();
    },
    fail(error: unknown = new Error('network failure')) {
      const sink = sinks.shift();
      assert.ok(sink, 'commitMutation must subscribe to the Relay network');
      sink.error(error);
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
  errors?: ReadonlyArray<{ message: string; path?: ReadonlyArray<string | number> }>,
) {
  const completion = startAdd(environment);
  respond({ data: payload, ...(errors ? { errors } : {}) });
  return completion;
}

function startAdd(
  environment: Environment,
  optimisticUpdater?: (store: RecordSourceSelectorProxy) => void,
  type = 'PARTY',
) {
  return new Promise<void>((resolve, reject) => {
    commitMutation<PostReactionControllerAddReactionMutation>(environment, {
      mutation: AddReactionMutation,
      onCompleted: () => resolve(),
      onError: reject,
      optimisticUpdater,
      variables: { postId, type },
    });
  });
}

function commitDelete(
  environment: Environment,
  respond: (payload: unknown) => void,
  payload: unknown,
  errors?: ReadonlyArray<{ message: string; path?: ReadonlyArray<string | number> }>,
) {
  const completion = startDelete(environment);
  respond({ data: payload, ...(errors ? { errors } : {}) });
  return completion;
}

function startDelete(
  environment: Environment,
  optimisticUpdater?: (store: RecordSourceSelectorProxy) => void,
  type = 'HEART',
  updater?: (
    store: RecordSourceSelectorProxy,
    data: PostReactionControllerDeleteReactionMutation['response'] | null | undefined,
  ) => void,
) {
  return new Promise<void>((resolve, reject) => {
    commitMutation<PostReactionControllerDeleteReactionMutation>(environment, {
      mutation: DeleteReactionMutation,
      onCompleted: () => resolve(),
      onError: reject,
      optimisticUpdater,
      updater,
      variables: { postId, type },
    });
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
    assert.ok(environment.getStore().getSource().get('reaction-heart'));
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

  it('unlinks a server-confirmed deleted reaction when delete returns no Post', async () => {
    const { environment, respond } = createEnvironment();
    environment.commitUpdate((store) => {
      const post = store.get(postId);
      post?.setLinkedRecords(
        [null, store.get('reaction-heart') ?? null, store.get('reaction-eyes') ?? null],
        'viewerReactions',
      );
    });

    const completion = startDelete(
      environment,
      undefined,
      'HEART',
      createReactionDeleteUpdater({ postId, type: 'HEART' }),
    );
    respond({
      data: {
        deleteReaction: { post: null, reactionId: 'reaction-heart' },
      },
    });
    await completion;

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
    ]);
  });

  it('unlinks the requested Type when the server delete ID differs from the cached ID', async () => {
    const { environment, respond } = createEnvironment();
    const completion = startDelete(
      environment,
      undefined,
      'HEART',
      createReactionDeleteUpdater({ postId, type: 'HEART' }),
    );
    respond({
      data: {
        deleteReaction: { post: null, reactionId: 'reaction-heart-server' },
      },
    });
    await completion;

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
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
    assert.equal(environment.getStore().getSource().get('reaction-heart'), null);
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

  it('applies an add only once from the current viewer membership and rolls it back on failure', async () => {
    const { environment, fail } = createEnvironment();
    const optimisticUpdater = createReactionOptimisticUpdater({
      nextSelected: true,
      optimisticCountId: 'client:reaction-count:party:1',
      optimisticReactionId: 'client:reaction:party:1',
      postId,
      type: 'PARTY',
    });

    const first = startAdd(environment, optimisticUpdater);
    const second = startAdd(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: true,
        optimisticCountId: 'client:reaction-count:party:2',
        optimisticReactionId: 'client:reaction:party:2',
        postId,
        type: 'PARTY',
      }),
    );

    assert.deepEqual(viewerReactionIds(environment), [
      'reaction-heart',
      'reaction-eyes',
      'client:reaction:party:1',
    ]);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
      { count: 1, type: 'PARTY' },
    ]);

    fail();
    await assert.rejects(first);
    assert.deepEqual(viewerReactionIds(environment), [
      'reaction-heart',
      'reaction-eyes',
      'client:reaction:party:2',
    ]);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
      { count: 1, type: 'PARTY' },
    ]);

    fail();
    await assert.rejects(second);
    assert.deepEqual(viewerReactionIds(environment), ['reaction-heart', 'reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
    ]);
  });

  it('replays a pending add over refreshed base data without duplicating it or dropping other Types', async () => {
    const { environment, respond } = createEnvironment();
    const completion = startAdd(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: true,
        optimisticCountId: 'client:reaction-count:party:rebase-base',
        optimisticReactionId: 'client:reaction:party:rebase-base',
        postId,
        type: 'PARTY',
      }),
    );

    environment.commitUpdate((store) => {
      const post = store.get(postId);
      const eyesCount = store.get('count-eyes');
      eyesCount?.setValue(4, 'count');

      const refreshedReaction = store.create('reaction-refreshed-smile', 'Reaction');
      refreshedReaction.setValue('reaction-refreshed-smile', 'id');
      refreshedReaction.setValue('SMILE', 'type');
      const refreshedCount = store.create('count-refreshed-smile', 'ReactionCount');
      refreshedCount.setValue(5, 'count');
      refreshedCount.setValue('SMILE', 'type');

      post?.setLinkedRecords(
        [...(post.getLinkedRecords('viewerReactions') ?? []), refreshedReaction],
        'viewerReactions',
      );
      post?.setLinkedRecords(
        [...(post.getLinkedRecords('reactionCounts') ?? []), refreshedCount],
        'reactionCounts',
      );
    });

    assert.deepEqual(viewerReactionIds(environment), [
      'reaction-heart',
      'reaction-eyes',
      'reaction-refreshed-smile',
      'client:reaction:party:rebase-base',
    ]);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 4, type: 'EYES' },
      { count: 5, type: 'SMILE' },
      { count: 1, type: 'PARTY' },
    ]);

    respond({ data: addPayload });
    await completion;
  });

  it('removes a zero delete count optimistically and restores it on failure', async () => {
    const { environment, fail } = createEnvironment();
    const completion = startDelete(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: false,
        optimisticCountId: 'client:reaction-count:heart:1',
        optimisticReactionId: 'client:reaction:heart:1',
        postId,
        type: 'HEART',
      }),
    );

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [{ count: 1, type: 'EYES' }]);

    fail();
    await assert.rejects(completion);
    assert.deepEqual(viewerReactionIds(environment), ['reaction-heart', 'reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
    ]);
  });

  it('rebases another Type after one optimistic request fails', async () => {
    const { environment, fail, respond } = createEnvironment();
    const add = startAdd(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: true,
        optimisticCountId: 'client:reaction-count:party:rebase',
        optimisticReactionId: 'client:reaction:party:rebase',
        postId,
        type: 'PARTY',
      }),
    );
    const remove = startDelete(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: false,
        optimisticCountId: 'client:reaction-count:heart:rebase',
        optimisticReactionId: 'client:reaction:heart:rebase',
        postId,
        type: 'HEART',
      }),
    );

    fail();
    await assert.rejects(add);
    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [{ count: 1, type: 'EYES' }]);

    respond({
      data: {
        deleteReaction: {
          post: {
            __typename: 'Post',
            id: postId,
            reactionCounts: [{ __typename: 'ReactionCount', count: 3, type: 'EYES' }],
            viewerReactions: [{ __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' }],
          },
          reactionId: null,
        },
      },
    });
    await remove;
    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [{ count: 3, type: 'EYES' }]);
  });

  it('converges an optimistic add to server identity, count, and order', async () => {
    const { environment, respond } = createEnvironment();
    const completion = startAdd(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: true,
        optimisticCountId: 'client:reaction-count:party:server',
        optimisticReactionId: 'client:reaction:party:server',
        postId,
        type: 'PARTY',
      }),
    );

    assert.ok(environment.getStore().getSource().get('client:reaction:party:server'));
    respond({
      data: {
        addReaction: {
          post: {
            __typename: 'Post',
            id: postId,
            reactionCounts: [
              { __typename: 'ReactionCount', count: 7, type: 'PARTY' },
              { __typename: 'ReactionCount', count: 4, type: 'EYES' },
            ],
            viewerReactions: [
              { __typename: 'Reaction', id: 'reaction-party-server', type: 'PARTY' },
              { __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' },
            ],
          },
          reaction: { __typename: 'Reaction', id: 'reaction-party-server', type: 'PARTY' },
        },
      },
    });
    await completion;

    assert.deepEqual(viewerReactionIds(environment), ['reaction-party-server', 'reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 7, type: 'PARTY' },
      { count: 4, type: 'EYES' },
    ]);
    assert.equal(environment.getStore().getSource().get('client:reaction:party:server'), undefined);
    assert.equal(
      environment.getStore().getSource().get('client:reaction-count:party:server'),
      undefined,
    );
  });

  it('accepts a nullable delete payload with GraphQL errors without guessing counts', async () => {
    const { environment, respond } = createEnvironment();
    const completion = startDelete(
      environment,
      createReactionOptimisticUpdater({
        nextSelected: false,
        optimisticCountId: 'client:reaction-count:heart:null',
        optimisticReactionId: 'client:reaction:heart:null',
        postId,
        type: 'HEART',
      }),
    );

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);
    respond({
      data: { deleteReaction: { post: null, reactionId: null } },
      errors: [{ message: 'partial delete response', path: ['deleteReaction', 'post'] }],
    });
    await completion;

    assert.deepEqual(viewerReactionIds(environment), ['reaction-heart', 'reaction-eyes']);
    assert.deepEqual(reactionCounts(environment), [
      { count: 1, type: 'HEART' },
      { count: 1, type: 'EYES' },
    ]);
  });
});
