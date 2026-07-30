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
import createBookmarkMutation from './__generated__/PostBookmarkActionCreateBookmarkMutation.graphql';
import deleteBookmarkMutation from './__generated__/PostBookmarkActionDeleteBookmarkMutation.graphql';

const postId = 'post-bookmark-target';
const bookmarkId = 'bookmark-active';

function createEnvironment(active = false) {
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

  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

function postRecord(environment: Environment) {
  const record = environment.getStore().getSource().get(postId);
  assert.ok(record);
  return record;
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

  it('uses the exact active Bookmark ID and normalizes deleteBookmark.post', () => {
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

    assert.equal(postRecord(environment).viewerBookmark, null);
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
});
