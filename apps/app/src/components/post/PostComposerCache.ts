import { ConnectionHandler } from 'relay-runtime';
import type { RecordProxy, RecordSourceSelectorProxy } from 'relay-runtime';

export const homeTimelineConnectionKey = 'PostList_homeTimeline';
export const profilePostsConnectionKey = 'PostList_profile_posts';

function prependEdgeIfMissing(
  parent: RecordProxy | null | undefined,
  connectionKey: string,
  store: RecordSourceSelectorProxy,
  post: RecordProxy,
) {
  if (!parent) {
    return;
  }

  const connection = ConnectionHandler.getConnection(parent, connectionKey);
  if (!connection) {
    return;
  }

  const nodeId = post.getDataID();
  const hasSameNode = connection
    .getLinkedRecords('edges')
    ?.some((existingEdge) => existingEdge?.getLinkedRecord('node')?.getDataID() === nodeId);
  if (hasSameNode) {
    return;
  }

  const edge = ConnectionHandler.createEdge(store, connection, post, 'PostConnectionEdge');
  ConnectionHandler.insertEdgeBefore(connection, edge);
}

export function updateCreatedPostConnections(
  store: RecordSourceSelectorProxy,
  profileId: string,
): void {
  const payload = store.getRootField('createPost');
  const post = payload?.getLinkedRecord('post');
  if (!post) {
    return;
  }

  prependEdgeIfMissing(store.getRoot(), homeTimelineConnectionKey, store, post);
  if (post.getLinkedRecord('replyParent') === null) {
    prependEdgeIfMissing(store.get(profileId), profilePostsConnectionKey, store, post);
  }
}
