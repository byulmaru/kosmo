import { ConnectionHandler } from 'relay-runtime';
import type { RecordProxy, RecordSourceSelectorProxy } from 'relay-runtime';

export const homeTimelineConnectionKey = 'PostList_homeTimeline';
export const profilePostsConnectionKey = 'PostList_profile_posts';

function prependEdgeIfMissing(
  parent: RecordProxy | null | undefined,
  connectionKey: string,
  edge: RecordProxy | null | undefined,
) {
  if (!parent || !edge) {
    return;
  }

  const node = edge.getLinkedRecord('node');
  if (!node) {
    return;
  }

  const connection = ConnectionHandler.getConnection(parent, connectionKey);
  if (!connection) {
    return;
  }

  const nodeId = node.getDataID();
  const hasSameNode = connection
    .getLinkedRecords('edges')
    ?.some((existingEdge) => existingEdge?.getLinkedRecord('node')?.getDataID() === nodeId);
  if (hasSameNode) {
    return;
  }

  ConnectionHandler.insertEdgeBefore(connection, edge);
}

export function updateCreatedPostConnections(
  store: RecordSourceSelectorProxy,
  profileId: string,
): void {
  const payload = store.getRootField('createPost');
  if (!payload) {
    return;
  }

  prependEdgeIfMissing(
    store.getRoot(),
    homeTimelineConnectionKey,
    payload.getLinkedRecord('homeTimelineEdge'),
  );
  prependEdgeIfMissing(
    store.get(profileId),
    profilePostsConnectionKey,
    payload.getLinkedRecord('profilePostsEdge'),
  );
}
