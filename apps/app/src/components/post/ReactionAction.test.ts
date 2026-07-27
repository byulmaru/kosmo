import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, describe, it } from 'node:test';
import { commitMutation } from 'react-relay';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import AddReactionMutation from './__generated__/ReactionActionAddReactionMutation.graphql';
import DeleteReactionMutation from './__generated__/ReactionActionDeleteReactionMutation.graphql';
import type { SelectorStoreUpdater } from 'relay-runtime';
import type { ReactionActionAddReactionMutation } from './__generated__/ReactionActionAddReactionMutation.graphql';
import type { ReactionActionDeleteReactionMutation } from './__generated__/ReactionActionDeleteReactionMutation.graphql';

const postId = 'post-content';
const missingPostId = 'post-missing';
const require = createRequire(import.meta.url);
let createAddReactionUpdater: (
  postId: string,
) => SelectorStoreUpdater<ReactionActionAddReactionMutation['response']>;
let createDeleteReactionUpdater: (
  postId: string,
  type: string,
) => SelectorStoreUpdater<ReactionActionDeleteReactionMutation['response']>;

before(async () => {
  Object.defineProperty(require('react-relay'), 'graphql', {
    value: () => null,
  });
  ({ createAddReactionUpdater, createDeleteReactionUpdater } = await import('./ReactionAction'));
});

type NetworkSink = {
  complete(): void;
  next(payload: unknown): void;
};

function createEnvironment({
  initialPost = true,
  initialViewerReactions = true,
}: {
  initialPost?: boolean;
  initialViewerReactions?: boolean;
} = {}) {
  const source = new RecordSource();
  if (initialPost) {
    source.set(postId, {
      __id: postId,
      __typename: 'Post',
      id: postId,
      ...(initialViewerReactions
        ? { viewerReactions: { __refs: ['reaction-heart', 'reaction-eyes'] } }
        : {}),
    });
  }
  source.set('reaction-heart', {
    __id: 'reaction-heart',
    __typename: 'Reaction',
    id: 'reaction-heart',
    type: 'HEART',
  });
  source.set('reaction-eyes', {
    __id: 'reaction-eyes',
    __typename: 'Reaction',
    id: 'reaction-eyes',
    type: 'EYES',
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

function viewerReactionIds(environment: Environment, id = postId) {
  const post = environment.getStore().getSource().get(id);
  return post?.viewerReactions?.__refs;
}

function commitAdd(
  environment: Environment,
  respond: (payload: unknown) => void,
  id = postId,
  type = 'HEART',
  payload: unknown = {
    addReaction: {
      reaction: { __typename: 'Reaction', id: 'reaction-heart-new', type },
    },
  },
  errors?: Array<{ message: string }>,
) {
  return new Promise<void>((resolve, reject) => {
    commitMutation<ReactionActionAddReactionMutation>(environment, {
      mutation: AddReactionMutation,
      variables: { postId: id, type },
      updater: createAddReactionUpdater(id),
      onCompleted: () => resolve(),
      onError: reject,
    });
    respond({ data: payload, ...(errors ? { errors } : {}) });
  });
}

function commitDelete(
  environment: Environment,
  respond: (payload: unknown) => void,
  id = postId,
  type = 'HEART',
  payload: unknown = {
    deleteReaction: { reactionId: null, post: null },
  },
) {
  return new Promise<void>((resolve, reject) => {
    commitMutation<ReactionActionDeleteReactionMutation>(environment, {
      mutation: DeleteReactionMutation,
      variables: { postId: id, type },
      updater: createDeleteReactionUpdater(id, type),
      onCompleted: () => resolve(),
      onError: reject,
    });
    respond({ data: payload });
  });
}

describe('ReactionAction Relay cache contract', () => {
  it('replaces the same Type and preserves other Types after add', async () => {
    const { environment, respond } = createEnvironment();

    await commitAdd(environment, respond);

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes', 'reaction-heart-new']);
  });

  it('keeps a repeated same-ID add payload at one plural-link entry', async () => {
    const { environment, respond } = createEnvironment();

    await commitAdd(environment, respond);
    await commitAdd(environment, respond);

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes', 'reaction-heart-new']);
  });

  it('applies add data with errors without synthesizing a missing Post or field', async () => {
    const withDataAndErrors = createEnvironment();
    await commitAdd(
      withDataAndErrors.environment,
      withDataAndErrors.respond,
      postId,
      'HEART',
      {
        addReaction: {
          reaction: { __typename: 'Reaction', id: 'reaction-heart-new', type: 'HEART' },
        },
      },
      [{ message: 'partial GraphQL error' }],
    );
    assert.deepEqual(viewerReactionIds(withDataAndErrors.environment), [
      'reaction-eyes',
      'reaction-heart-new',
    ]);

    const withoutPayload = createEnvironment();
    await commitAdd(withoutPayload.environment, withoutPayload.respond, postId, 'HEART', {});
    assert.deepEqual(viewerReactionIds(withoutPayload.environment), [
      'reaction-heart',
      'reaction-eyes',
    ]);

    const withoutPost = createEnvironment({ initialPost: false });
    await commitAdd(withoutPost.environment, withoutPost.respond, missingPostId);
    assert.equal(withoutPost.environment.getStore().getSource().get(missingPostId), undefined);

    const withoutField = createEnvironment({ initialViewerReactions: false });
    await commitAdd(withoutField.environment, withoutField.respond);
    assert.equal(viewerReactionIds(withoutField.environment), undefined);
  });

  it('keeps the authoritative delete post payload even with a null reactionId', async () => {
    const existingPost = createEnvironment();
    await commitDelete(existingPost.environment, existingPost.respond, postId, 'HEART', {
      deleteReaction: {
        reactionId: null,
        post: {
          __typename: 'Post',
          id: postId,
          viewerReactions: [{ __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' }],
        },
      },
    });
    assert.deepEqual(viewerReactionIds(existingPost.environment), ['reaction-eyes']);

    const withoutInitialField = createEnvironment({ initialViewerReactions: false });
    await commitDelete(
      withoutInitialField.environment,
      withoutInitialField.respond,
      postId,
      'HEART',
      {
        deleteReaction: {
          reactionId: null,
          post: {
            __typename: 'Post',
            id: postId,
            viewerReactions: [{ __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' }],
          },
        },
      },
    );
    assert.deepEqual(viewerReactionIds(withoutInitialField.environment), ['reaction-eyes']);

    const withoutPost = createEnvironment({ initialPost: false });
    await commitDelete(withoutPost.environment, withoutPost.respond, missingPostId, 'HEART', {
      deleteReaction: {
        reactionId: null,
        post: {
          __typename: 'Post',
          id: missingPostId,
          viewerReactions: [{ __typename: 'Reaction', id: 'reaction-eyes', type: 'EYES' }],
        },
      },
    });
    assert.deepEqual(viewerReactionIds(withoutPost.environment, missingPostId), ['reaction-eyes']);
  });

  it('removes only the requested Type for a null delete post without synthesizing records', async () => {
    const { environment, respond } = createEnvironment();

    await commitDelete(environment, respond);

    assert.deepEqual(viewerReactionIds(environment), ['reaction-eyes']);

    const withoutPayload = createEnvironment();
    await commitDelete(withoutPayload.environment, withoutPayload.respond, postId, 'HEART', {});
    assert.deepEqual(viewerReactionIds(withoutPayload.environment), [
      'reaction-heart',
      'reaction-eyes',
    ]);

    const withoutPost = createEnvironment({ initialPost: false });
    await commitDelete(withoutPost.environment, withoutPost.respond, missingPostId);
    assert.equal(withoutPost.environment.getStore().getSource().get(missingPostId), undefined);

    const withoutField = createEnvironment({ initialViewerReactions: false });
    await commitDelete(withoutField.environment, withoutField.respond);
    assert.equal(viewerReactionIds(withoutField.environment), undefined);
  });

  it('keeps add, delete, and reverse-Type completion isolated to their actor Store', async () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();

    await commitAdd(actorA.environment, actorA.respond);
    await commitDelete(actorA.environment, actorA.respond);
    await commitAdd(actorA.environment, actorA.respond, postId, 'EYES', {
      addReaction: {
        reaction: { __typename: 'Reaction', id: 'reaction-eyes-new', type: 'EYES' },
      },
    });

    assert.deepEqual(viewerReactionIds(actorA.environment), ['reaction-eyes-new']);
    assert.deepEqual(viewerReactionIds(actorB.environment), ['reaction-heart', 'reaction-eyes']);
  });
});
