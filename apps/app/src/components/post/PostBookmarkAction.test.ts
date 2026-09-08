import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  commitMutation,
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import createBookmarkMutation from './__generated__/PostBookmarkActionCreateBookmarkMutation.graphql';
import deleteBookmarkMutation from './__generated__/PostBookmarkActionDeleteBookmarkMutation.graphql';
import type { GraphQLResponse, MutableRecordSource } from 'relay-runtime';
import type { PostBookmarkActionDeleteBookmarkMutation } from './__generated__/PostBookmarkActionDeleteBookmarkMutation.graphql';

const postId = 'post-bookmark-target';
const bookmarkId = 'bookmark-active';
const profileId = 'profile-bookmark-owner';
const bookmarkConnectionId = ConnectionHandler.getConnectionID(
  profileId,
  'BookmarkConnectionList_bookmarks',
);
const bookmarkEdgeId = 'bookmark-edge-active';

function loadBookmarkConnection(environment: Environment) {
  const source = environment.getStore().getSource() as MutableRecordSource;
  source.set(bookmarkConnectionId, {
    __id: bookmarkConnectionId,
    __typename: 'BookmarkConnection',
    edges: { __refs: [bookmarkEdgeId] },
  });
  source.set(bookmarkEdgeId, {
    __id: bookmarkEdgeId,
    __typename: 'BookmarkConnectionEdge',
    cursor: 'bookmark-cursor-active',
    node: { __ref: bookmarkId },
  });
}

function createEnvironment(active = false, connectionLoaded = active) {
  const source = new RecordSource();
  source.set(postId, {
    __id: postId,
    __typename: 'Post',
    id: postId,
    viewerBookmark: active ? { __ref: bookmarkId } : null,
  });
  if (active) {
    source.set(bookmarkId, {
      __id: bookmarkId,
      __typename: 'Bookmark',
      id: bookmarkId,
    });
  }

  const environment = new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
  if (active && connectionLoaded) {
    loadBookmarkConnection(environment);
  }
  return environment;
}

function createMutationEnvironment(response: GraphQLResponse) {
  const seeded = createEnvironment(true);
  return new Environment({
    network: Network.create(() => Promise.resolve(response)),
    store: seeded.getStore(),
  });
}

function postRecord(environment: Environment) {
  const record = environment.getStore().getSource().get(postId);
  assert.ok(record);
  return record;
}

function deleteVariables() {
  return { connections: [bookmarkConnectionId], input: { id: bookmarkId } };
}

describe('PostBookmarkAction Relay cache contract', () => {
  it('normalizes createBookmark.viewerBookmark onto the target Post', () => {
    const environment = createEnvironment();
    const operation = createOperationDescriptor(getRequest(createBookmarkMutation), {
      input: { postId },
    });

    environment.commitPayload(operation, {
      createBookmark: {
        bookmark: {
          __typename: 'Bookmark',
          id: bookmarkId,
          post: {
            __typename: 'Post',
            id: postId,
            viewerBookmark: { __typename: 'Bookmark', id: bookmarkId },
          },
        },
      },
    });

    assert.deepEqual(postRecord(environment).viewerBookmark, { __ref: bookmarkId });
  });

  it('uses the exact active Bookmark ID and removes it from the loaded Bookmark connection', () => {
    const environment = createEnvironment(true);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      ...deleteVariables(),
    });

    assert.deepEqual(operation.request.variables, deleteVariables());
    environment.commitPayload(operation, {
      deleteBookmark: {
        requestedBookmarkId: bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });

    assert.equal(postRecord(environment).viewerBookmark, null);
    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
    assert.deepEqual(environment.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [],
    });
  });

  it('deletes the active Bookmark without a connection update when the list is not loaded', () => {
    const environment = createEnvironment(true, false);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      ...deleteVariables(),
    });

    environment.commitPayload(operation, {
      deleteBookmark: {
        requestedBookmarkId: bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });

    assert.equal(postRecord(environment).viewerBookmark, null);
    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
  });

  it('removes a Bookmark connection loaded while the delete request is pending', () => {
    const environment = createEnvironment(true, false);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      ...deleteVariables(),
    });

    loadBookmarkConnection(environment);
    environment.commitPayload(operation, {
      deleteBookmark: {
        requestedBookmarkId: bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });

    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
    assert.deepEqual(environment.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [],
    });
  });

  it('treats an error-free null delete response as idempotent success and clears the actor cache', () => {
    const environment = createEnvironment(true);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      ...deleteVariables(),
    });

    environment.commitPayload(operation, {
      deleteBookmark: {
        requestedBookmarkId: bookmarkId,
        post: null,
      },
    });

    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
    assert.deepEqual(environment.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [],
    });
  });

  it('keeps Bookmark state isolated per Relay actor Store', () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();
    const operation = createOperationDescriptor(getRequest(createBookmarkMutation), {
      input: { postId },
    });

    actorA.commitPayload(operation, {
      createBookmark: {
        bookmark: {
          __typename: 'Bookmark',
          id: bookmarkId,
          post: {
            __typename: 'Post',
            id: postId,
            viewerBookmark: { __typename: 'Bookmark', id: bookmarkId },
          },
        },
      },
    });

    assert.deepEqual(postRecord(actorA).viewerBookmark, { __ref: bookmarkId });
    assert.equal(postRecord(actorB).viewerBookmark, null);
  });

  it('keeps Bookmark deletion isolated to the request Relay actor Store', () => {
    const actorA = createEnvironment(true);
    const actorB = createEnvironment(true);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      ...deleteVariables(),
    });

    actorA.commitPayload(operation, {
      deleteBookmark: {
        requestedBookmarkId: bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });

    assert.equal(postRecord(actorA).viewerBookmark, null);
    assert.equal(actorA.getStore().getSource().get(bookmarkId), null);
    assert.deepEqual(actorA.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [],
    });
    assert.deepEqual(postRecord(actorB).viewerBookmark, { __ref: bookmarkId });
    assert.ok(actorB.getStore().getSource().get(bookmarkId));
    assert.deepEqual(actorB.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [bookmarkEdgeId],
    });
  });

  it('preserves the Post, Bookmark, and connection after a GraphQL delete error', async () => {
    const environment = createMutationEnvironment({
      data: {
        deleteBookmark: null,
      },
      errors: [{ message: 'partial failure' }],
    });

    const completion: { error: Error | null } = { error: null };
    const errors = await new Promise<ReadonlyArray<{ message: string }> | null | undefined>(
      (resolve, reject) => {
        commitMutation<PostBookmarkActionDeleteBookmarkMutation>(environment, {
          mutation: deleteBookmarkMutation,
          onCompleted: (response, completedErrors) => {
            completion.error = completedErrors?.[0]
              ? new Error(completedErrors[0].message)
              : response
                ? null
                : new Error('Delete Bookmark response was empty.');
            resolve(completedErrors);
          },
          onError: reject,
          variables: deleteVariables(),
        });
      },
    );

    assert.equal(errors?.[0]?.message, 'partial failure');
    assert.equal(completion.error?.message, 'partial failure');
    assert.deepEqual(postRecord(environment).viewerBookmark, { __ref: bookmarkId });
    assert.ok(environment.getStore().getSource().get(bookmarkId));
    assert.deepEqual(environment.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [bookmarkEdgeId],
    });
  });

  it('deletes the Bookmark when the ID is returned with nested projection errors', async () => {
    const environment = createMutationEnvironment({
      data: {
        deleteBookmark: {
          requestedBookmarkId: bookmarkId,
          post: {
            id: postId,
            viewerBookmark: null,
          },
        },
      },
      errors: [
        {
          message: 'viewerBookmark projection failed',
          path: ['deleteBookmark', 'post', 'viewerBookmark'],
        },
      ],
    });

    const completion: { error: Error | null } = { error: null };
    const errors = await new Promise<ReadonlyArray<{ message: string }> | null | undefined>(
      (resolve, reject) => {
        commitMutation<PostBookmarkActionDeleteBookmarkMutation>(environment, {
          mutation: deleteBookmarkMutation,
          onCompleted: (response, completedErrors) => {
            completion.error = completedErrors?.[0]
              ? new Error(completedErrors[0].message)
              : response
                ? null
                : new Error('Delete Bookmark response was empty.');
            resolve(completedErrors);
          },
          onError: reject,
          variables: deleteVariables(),
        });
      },
    );

    assert.equal(errors?.[0]?.message, 'viewerBookmark projection failed');
    assert.equal(completion.error?.message, 'viewerBookmark projection failed');
    assert.equal(postRecord(environment).viewerBookmark, null);
    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
    assert.deepEqual(environment.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [],
    });
  });
});
