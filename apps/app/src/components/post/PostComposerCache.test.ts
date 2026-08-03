import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  commitMutation,
  ConnectionHandler,
  Environment,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import { post, profile } from '../../stories/fixtures';
import CreatePostMutation from './__generated__/PostComposerCreatePostMutation.graphql';
import {
  getCreatedPostConnectionIds,
  homeTimelineConnectionKey,
  profilePostsConnectionKey,
} from './PostComposerCache';
import type { PayloadError } from 'relay-runtime';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';

const rootId = 'client:root';
const profileId = 'profile-created-post-author';
const oldPostId = 'post-existing';
const pendingPayloads = new WeakMap<Environment, ReturnType<typeof payload>>();
const pendingErrors = new WeakMap<Environment, PayloadError[]>();

function connectionHandle(key: string) {
  return `__${key}_connection`;
}

function createEnvironment({
  homeLoaded = true,
  profileLoaded = true,
  existingPostId = oldPostId,
}: {
  homeLoaded?: boolean;
  profileLoaded?: boolean;
  existingPostId?: string;
} = {}) {
  const source = new RecordSource();
  source.set(rootId, { __id: rootId, __typename: '__Root' });
  source.set(profileId, { __id: profileId, __typename: 'Profile', id: profileId });
  source.set(existingPostId, { __id: existingPostId, __typename: 'Post', id: existingPostId });

  for (const [parentId, key, loaded] of [
    [rootId, homeTimelineConnectionKey, homeLoaded],
    [profileId, profilePostsConnectionKey, profileLoaded],
  ] as const) {
    if (!loaded) {
      continue;
    }

    const connectionId = ConnectionHandler.getConnectionID(parentId, key);
    const edgeId = `${connectionId}:edge`;
    source.set(parentId, {
      __id: parentId,
      __typename: parentId === rootId ? '__Root' : 'Profile',
      ...(parentId === profileId ? { id: profileId } : {}),
      [connectionHandle(key)]: { __ref: connectionId },
    });
    source.set(connectionId, {
      __id: connectionId,
      __typename: 'PostConnection',
      edges: { __refs: [edgeId] },
    });
    source.set(edgeId, {
      __id: edgeId,
      __typename: 'PostConnectionEdge',
      cursor: `cursor-${existingPostId}`,
      node: { __ref: existingPostId },
    });
  }

  const environmentRef: { current?: Environment } = {};
  const environment = new Environment({
    network: Network.create(() => {
      const environment = environmentRef.current!;
      const errors = pendingErrors.get(environment) ?? [];
      return Promise.resolve({
        data: { createPost: pendingPayloads.get(environment) },
        ...(errors.length > 0 ? { errors } : {}),
      });
    }),
    store: new Store(source),
  });
  environmentRef.current = environment;
  return environment;
}

async function applyPayload(
  environment: Environment,
  createdPayload: ReturnType<typeof payload>,
  errors: readonly PayloadError[] = [],
): Promise<readonly PayloadError[] | null | undefined> {
  pendingPayloads.set(environment, createdPayload);
  pendingErrors.set(environment, [...errors]);
  return new Promise<readonly PayloadError[] | null | undefined>((resolve, reject) => {
    commitMutation<PostComposerCreatePostMutation>(environment, {
      mutation: CreatePostMutation,
      onCompleted: (_response, completionErrors) => resolve(completionErrors),
      onError: reject,
      variables: {
        connections: getCreatedPostConnectionIds(profileId, createdPayload.post.replyParent?.id),
        input: { bodyText: '새 게시글', visibility: 'UNLISTED' },
      },
    });
  });
}

function edgeNodes(environment: Environment, parentId: string, key: string) {
  const connectionId = ConnectionHandler.getConnectionID(parentId, key);
  const connection = environment.getStore().getSource().get(connectionId);
  const refs = connection?.edges;
  if (!refs || !('__refs' in refs)) {
    return [];
  }
  return (refs as { __refs: string[] }).__refs.map((edgeId) => {
    const edge = environment.getStore().getSource().get(edgeId);
    const node = edge?.node;
    return {
      cursor: edge?.cursor,
      id: node && '__ref' in node ? node.__ref : undefined,
    };
  });
}

function payload(postId: string, replyParentId: string | null = null) {
  return {
    post: {
      ...post({
        bodyText: '새 게시글',
        createdAt: '2026-08-03T00:00:00.000Z',
        id: postId,
        profile: profile({
          displayName: '작성자',
          handle: 'author',
          id: profileId,
          relativeHandle: 'author',
        }),
        replyParent:
          replyParentId == null ? null : { __typename: 'Post' as const, id: replyParentId },
      }),
      viewerReactions: [],
    },
  };
}

describe('PostComposer Relay connection cache', () => {
  it('prepends normalized posts in both loaded connections and deduplicates completion', async () => {
    const environment = createEnvironment();
    const created = payload('post-created');

    await applyPayload(environment, created);
    await applyPayload(environment, created);

    assert.deepEqual(edgeNodes(environment, rootId, homeTimelineConnectionKey), [
      { cursor: null, id: 'post-created' },
      { cursor: 'cursor-post-existing', id: oldPostId },
    ]);
    assert.deepEqual(edgeNodes(environment, profileId, profilePostsConnectionKey), [
      { cursor: null, id: 'post-created' },
      { cursor: 'cursor-post-existing', id: oldPostId },
    ]);
  });

  it('keeps a committed Post successful when GraphQL errors accompany the response', async () => {
    const environment = createEnvironment();

    const completionErrors = await applyPayload(environment, payload('post-partial'), [
      { message: 'nullable loader 조회에 실패했습니다.' },
    ]);

    assert.deepEqual(
      completionErrors?.map(({ message }) => message),
      ['nullable loader 조회에 실패했습니다.'],
    );
    assert.deepEqual(edgeNodes(environment, rootId, homeTimelineConnectionKey), [
      { cursor: null, id: 'post-partial' },
      { cursor: 'cursor-post-existing', id: oldPostId },
    ]);
    assert.deepEqual(edgeNodes(environment, profileId, profilePostsConnectionKey), [
      { cursor: null, id: 'post-partial' },
      { cursor: 'cursor-post-existing', id: oldPostId },
    ]);
  });

  it('keeps replies out of Profile and does not synthesize unloaded connections', async () => {
    const environment = createEnvironment({ profileLoaded: false });

    await applyPayload(environment, payload('post-reply', oldPostId));
    await applyPayload(environment, payload('post-original'));

    assert.deepEqual(edgeNodes(environment, rootId, homeTimelineConnectionKey), [
      { cursor: null, id: 'post-original' },
      { cursor: null, id: 'post-reply' },
      { cursor: 'cursor-post-existing', id: oldPostId },
    ]);
    assert.equal(
      environment
        .getStore()
        .getSource()
        .get(ConnectionHandler.getConnectionID(profileId, profilePostsConnectionKey)),
      undefined,
    );
  });
});
