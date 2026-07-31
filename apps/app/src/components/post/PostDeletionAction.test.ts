import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import deletePostMutation from './__generated__/PostDeletionActionDeletePostMutation.graphql';

const postId = 'post-author-owned';

function createEnvironment() {
  const source = new RecordSource();
  source.set(postId, {
    __id: postId,
    __typename: 'Post',
    content: { __ref: 'content:post-author-owned' },
    id: postId,
    profile: { __ref: 'profile:author' },
  });
  source.set('content:post-author-owned', {
    __id: 'content:post-author-owned',
    __typename: 'PostContent',
    id: 'content:post-author-owned',
  });
  source.set('profile:author', {
    __id: 'profile:author',
    __typename: 'Profile',
    id: 'profile:author',
  });
  source.set('home-edge', {
    __id: 'home-edge',
    __typename: 'PostConnectionEdge',
    cursor: 'home-edge-cursor',
    node: { __ref: postId },
  });

  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

describe('PostDeletionAction Relay cache contract', () => {
  it('deletes only the post record in the actor Store after server success', () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();
    const operation = createOperationDescriptor(getRequest(deletePostMutation), { id: postId });

    actorA.commitPayload(operation, { deletePost: { postId } });

    assert.equal(actorA.getStore().getSource().get(postId), null);
    assert.ok(actorA.getStore().getSource().get('content:post-author-owned'));
    assert.ok(actorB.getStore().getSource().get(postId));
  });

  it('captures the stale connection edge that PostList must guard after record deletion', () => {
    const actor = createEnvironment();
    const operation = createOperationDescriptor(getRequest(deletePostMutation), { id: postId });

    actor.commitPayload(operation, { deletePost: { postId } });

    const staleEdge = actor.getStore().getSource().get('home-edge');
    assert.deepEqual(staleEdge?.node, { __ref: postId });
    assert.equal(actor.getStore().getSource().get(postId), null);
  });
});
