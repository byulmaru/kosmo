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
import CreatePostMutation from './__generated__/PostComposerCreatePostMutation.graphql';
import {
  homeTimelineConnectionKey,
  profilePostsConnectionKey,
  updateCreatedPostConnections,
} from './PostComposerCache';
import type { PayloadError } from 'relay-runtime';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';

const rootId = 'client:root';
const profileId = 'profile-created-post-author';
const oldPostId = 'post-existing';
const pendingPayloads = new WeakMap<Environment, CreatedPostPayload>();
const pendingErrors = new WeakMap<Environment, PayloadError[]>();

type CreatedPostPayload = {
  post: {
    __typename: 'Post';
    content: {
      __typename: 'PostContent';
      bodyText: string;
      document: null;
      id: string;
      media: ReadonlyArray<never>;
    };
    createdAt: string;
    id: string;
    profile: {
      __typename: 'Profile';
      avatar: null;
      displayName: string;
      handle: string;
      id: string;
      relativeHandle: string;
    };
    replyParent: { __typename: 'Post'; id: string } | null;
    reactionCounts: ReadonlyArray<never>;
    repostCount: number;
    repostSource: null;
    state: 'ACTIVE';
    viewerBookmark: null;
    viewerReactions: ReadonlyArray<never>;
    viewerRepost: null;
    visibility: 'UNLISTED';
  };
};

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
  payload: CreatedPostPayload,
  errors: readonly PayloadError[] = [],
): Promise<readonly PayloadError[] | null | undefined> {
  pendingPayloads.set(environment, payload);
  pendingErrors.set(environment, [...errors]);
  return new Promise<readonly PayloadError[] | null | undefined>((resolve, reject) => {
    commitMutation<PostComposerCreatePostMutation>(environment, {
      mutation: CreatePostMutation,
      onCompleted: (_response, completionErrors) => resolve(completionErrors),
      onError: reject,
      updater: (store) => updateCreatedPostConnections(store, profileId),
      variables: { input: { bodyText: '새 게시글', visibility: 'UNLISTED' } },
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

function payload(postId: string, replyParentId: string | null = null): CreatedPostPayload {
  return {
    post: {
      __typename: 'Post' as const,
      content: {
        __typename: 'PostContent' as const,
        bodyText: '새 게시글',
        document: null,
        id: `content-${postId}`,
        media: [],
      },
      createdAt: '2026-08-03T00:00:00.000Z',
      id: postId,
      profile: {
        __typename: 'Profile' as const,
        avatar: null,
        displayName: '작성자',
        handle: 'author',
        id: profileId,
        relativeHandle: 'author',
      },
      replyParent:
        replyParentId == null ? null : { __typename: 'Post' as const, id: replyParentId },
      reactionCounts: [],
      repostCount: 0,
      repostSource: null,
      state: 'ACTIVE' as const,
      viewerBookmark: null,
      viewerReactions: [],
      viewerRepost: null,
      visibility: 'UNLISTED' as const,
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

  it('normalizes the created Post list fragment before inserting its edge', async () => {
    const environment = createEnvironment();

    await applyPayload(environment, payload('post-with-list-fields'));

    const source = environment.getStore().getSource();
    const post = source.get('post-with-list-fields');
    assert.equal(post?.createdAt, '2026-08-03T00:00:00.000Z');

    const content = post?.content;
    assert.ok(content && '__ref' in content);
    assert.equal(source.get(content.__ref)?.bodyText, '새 게시글');

    const profile = post?.profile;
    assert.ok(profile && '__ref' in profile);
    assert.equal(source.get(profile.__ref)?.relativeHandle, 'author');
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

  it('does not replace an existing same-node edge', async () => {
    const actorA = createEnvironment({ existingPostId: 'post-same-node' });

    await applyPayload(actorA, payload('post-same-node'));

    assert.deepEqual(edgeNodes(actorA, rootId, homeTimelineConnectionKey), [
      { cursor: 'cursor-post-same-node', id: 'post-same-node' },
    ]);
  });
});
