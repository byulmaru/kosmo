import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  commitMutation,
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import createBookmarkMutation from './__generated__/PostBookmarkActionCreateBookmarkMutation.graphql';
import deleteBookmarkMutation from './__generated__/PostBookmarkActionDeleteBookmarkMutation.graphql';
import { applyBookmarkDeleteResponse, getBookmarkConnectionId } from './PostBookmarkActionCache';
import type { GraphQLResponse, MutableRecordSource } from 'relay-runtime';
import type { PostBookmarkActionDeleteBookmarkMutation } from './__generated__/PostBookmarkActionDeleteBookmarkMutation.graphql';

const postId = 'post-bookmark-target';
const bookmarkId = 'bookmark-active';
const profileId = 'profile-bookmark-owner';
const bookmarkConnectionId = getBookmarkConnectionId(profileId);
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

function applyBookmarkDeleteUpdater(environment: Environment) {
  const error = applyBookmarkDeleteResponse(
    environment,
    postId,
    bookmarkId,
    bookmarkConnectionId,
    bookmarkId,
    null,
  );
  assert.equal(error, null);
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
      input: { id: bookmarkId },
    });

    assert.deepEqual(operation.request.variables, { input: { id: bookmarkId } });
    environment.commitPayload(operation, {
      deleteBookmark: {
        bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });
    applyBookmarkDeleteUpdater(environment);

    assert.equal(postRecord(environment).viewerBookmark, null);
    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
    assert.deepEqual(environment.getStore().getSource().get(bookmarkConnectionId)?.edges, {
      __refs: [],
    });
  });

  it('deletes the active Bookmark without a connection update when the list is not loaded', () => {
    const environment = createEnvironment(true, false);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      input: { id: bookmarkId },
    });

    environment.commitPayload(operation, {
      deleteBookmark: {
        bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });
    applyBookmarkDeleteUpdater(environment);

    assert.equal(postRecord(environment).viewerBookmark, null);
    assert.equal(environment.getStore().getSource().get(bookmarkId), null);
  });

  it('removes a Bookmark connection loaded while the delete request is pending', () => {
    const environment = createEnvironment(true, false);
    const operation = createOperationDescriptor(getRequest(deleteBookmarkMutation), {
      input: { id: bookmarkId },
    });

    loadBookmarkConnection(environment);
    environment.commitPayload(operation, {
      deleteBookmark: {
        bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });
    applyBookmarkDeleteUpdater(environment);

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
      input: { id: bookmarkId },
    });

    actorA.commitPayload(operation, {
      deleteBookmark: {
        bookmarkId,
        post: { __typename: 'Post', id: postId, viewerBookmark: null },
      },
    });
    applyBookmarkDeleteUpdater(actorA);

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
        deleteBookmark: {
          bookmarkId,
          post: { __typename: 'Post', id: postId, viewerBookmark: null },
        },
      },
      errors: [{ message: 'partial failure' }],
    });

    const completion: { error: Error | null } = { error: null };
    const errors = await new Promise<ReadonlyArray<{ message: string }> | null | undefined>(
      (resolve, reject) => {
        commitMutation<PostBookmarkActionDeleteBookmarkMutation>(environment, {
          mutation: deleteBookmarkMutation,
          onCompleted: (response, completedErrors) => {
            completion.error = applyBookmarkDeleteResponse(
              environment,
              postId,
              bookmarkId,
              bookmarkConnectionId,
              response?.deleteBookmark?.bookmarkId,
              completedErrors,
            );
            resolve(completedErrors);
          },
          onError: reject,
          variables: { input: { id: bookmarkId } },
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
});
