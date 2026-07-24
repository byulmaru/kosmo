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
import deletePostMutation from './__generated__/useRepostActionDeletePostMutation.graphql';
import repostPostMutation from './__generated__/useRepostActionRepostPostMutation.graphql';

const sourcePostId = 'post-source';
const activeRepostId = 'post-repost-active';

function createEnvironment() {
  const source = new RecordSource();
  source.set(sourcePostId, {
    __id: sourcePostId,
    __typename: 'Post',
    id: sourcePostId,
    repostCount: 3,
    viewerRepost: null,
  });

  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

function sourceRecord(environment: Environment) {
  const record = environment.getStore().getSource().get(sourcePostId);
  assert.ok(record);
  return record;
}

describe('useRepostAction Relay cache contract', () => {
  it('normalizes repost creation onto the source Post record', () => {
    const environment = createEnvironment();
    const operation = createOperationDescriptor(getRequest(repostPostMutation), {
      sourceId: sourcePostId,
    });

    environment.commitPayload(operation, {
      repostPost: {
        repost: {
          __typename: 'Post',
          id: activeRepostId,
          repostSource: {
            __typename: 'Post',
            id: sourcePostId,
            repostCount: 4,
            viewerRepost: { __typename: 'Post', id: activeRepostId },
          },
        },
      },
    });

    assert.equal(sourceRecord(environment).repostCount, 4);
    assert.deepEqual(sourceRecord(environment).viewerRepost, { __ref: activeRepostId });
  });

  it('uses the exact active Repost id for delete without changing the source cache', () => {
    const environment = createEnvironment();
    const before = sourceRecord(environment);
    const operation = createOperationDescriptor(getRequest(deletePostMutation), {
      id: activeRepostId,
    });

    environment.commitPayload(operation, {
      deletePost: { postId: activeRepostId },
    });

    assert.equal(sourceRecord(environment), before);
    assert.equal(sourceRecord(environment).repostCount, 3);
    assert.equal(sourceRecord(environment).viewerRepost, null);
  });

  it('keeps normalized source state isolated per Relay actor Store', () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();
    const operation = createOperationDescriptor(getRequest(repostPostMutation), {
      sourceId: sourcePostId,
    });

    actorA.commitPayload(operation, {
      repostPost: {
        repost: {
          __typename: 'Post',
          id: activeRepostId,
          repostSource: {
            __typename: 'Post',
            id: sourcePostId,
            repostCount: 4,
            viewerRepost: { __typename: 'Post', id: activeRepostId },
          },
        },
      },
    });

    assert.equal(sourceRecord(actorA).repostCount, 4);
    assert.equal(sourceRecord(actorB).repostCount, 3);
    assert.equal(sourceRecord(actorB).viewerRepost, null);
  });
});
