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
import postRequestCardRefetchQuery from './__generated__/PostRequestCardRefetchQuery.graphql';

const parentId = 'post-parent';
const postId = 'post-author-owned';

function createEnvironment(replyCount = 1) {
  const source = new RecordSource();
  source.set(parentId, {
    __id: parentId,
    __typename: 'Post',
    id: parentId,
    replyCount,
  });
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

    actorA.commitPayload(operation, { deletePost: { postId, replyParent: null } });

    assert.equal(actorA.getStore().getSource().get(postId), null);
    assert.ok(actorA.getStore().getSource().get('content:post-author-owned'));
    assert.ok(actorB.getStore().getSource().get(postId));
  });

  it('captures the stale connection edge that PostList must guard after record deletion', () => {
    const actor = createEnvironment();
    const operation = createOperationDescriptor(getRequest(deletePostMutation), { id: postId });

    actor.commitPayload(operation, { deletePost: { postId, replyParent: null } });

    const staleEdge = actor.getStore().getSource().get('home-edge');
    assert.deepEqual(staleEdge?.node, { __ref: postId });
    assert.equal(actor.getStore().getSource().get(postId), null);
  });

  it('normalizes a published reply Parent count from its request into only the actor Store', () => {
    const actorA = createEnvironment(0);
    const actorB = createEnvironment(0);
    const operation = createOperationDescriptor(getRequest(postRequestCardRefetchQuery), {
      id: 'post-request-node',
    });

    actorA.commitPayload(operation, {
      node: {
        __typename: 'PostRequest',
        id: 'post-request-node',
        post: {
          id: 'post-created-reply',
          replyParent: { id: parentId, replyCount: 1 },
        },
      },
    });

    assert.equal(actorA.getStore().getSource().get(parentId)?.replyCount, 1);
    assert.equal(actorB.getStore().getSource().get(parentId)?.replyCount, 0);
  });

  it('normalizes the server-confirmed Parent count after Reply deletion in only the request actor Store', () => {
    const actorA = createEnvironment(1);
    const actorB = createEnvironment(1);
    const operation = createOperationDescriptor(getRequest(deletePostMutation), { id: postId });

    actorA.commitPayload(operation, {
      deletePost: { postId, replyParent: { id: parentId, replyCount: 0 } },
    });

    assert.equal(actorA.getStore().getSource().get(parentId)?.replyCount, 0);
    assert.equal(actorB.getStore().getSource().get(parentId)?.replyCount, 1);
  });
});
