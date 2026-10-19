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
import createPostMutation from './__generated__/PostComposerCreatePostMutation.graphql';
import deletePostMutation from './__generated__/PostDeletionActionDeletePostMutation.graphql';

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

  it('normalizes the server-confirmed Parent count after Reply creation in only the request actor Store', () => {
    const actorA = createEnvironment(0);
    const actorB = createEnvironment(0);
    const operation = createOperationDescriptor(getRequest(createPostMutation), {
      connections: [],
      input: {},
      prependToHome: false,
    });

    actorA.commitPayload(operation, {
      createPost: {
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

  it('keeps deletion successful when the optional Parent count field reports a GraphQL error', async () => {
    const { getPostDeletionMutationOutcome } = await import('./postDeletionOutcome');

    assert.deepEqual(
      getPostDeletionMutationOutcome(
        { deletePost: { postId, replyParent: { id: parentId, replyCount: null } } },
        [{ message: 'Reply count query failed' }],
        '게시글 삭제 실패',
      ),
      { kind: 'committed', postId },
    );
  });

  it('keeps deletion failed when the mutation response has no committed postId', async () => {
    const { getPostDeletionMutationOutcome } = await import('./postDeletionOutcome');

    assert.deepEqual(
      getPostDeletionMutationOutcome(
        { deletePost: { postId: null, replyParent: null } },
        [{ message: 'Delete failed' }],
        '게시글 삭제 실패',
      ),
      { kind: 'failed', message: 'Delete failed' },
    );
  });
});
