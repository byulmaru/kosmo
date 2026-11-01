import { ConnectionHandler } from 'relay-runtime';
import type { RecordSourceSelectorProxy } from 'relay-runtime';

export const POST_REQUEST_HOME_ACTIVE_STATUSES = [
  'CONFIRMING',
  'FAILED',
  'PROCESSING',
  'PUBLISHING',
  'QUEUED',
] as const;

export function prependPostRequestToLoadedLists(
  store: RecordSourceSelectorProxy,
  profileId: string,
  requestNodeId: string,
) {
  const request = store.get(requestNodeId);
  if (!request) {
    return;
  }

  const root = store.getRoot();
  for (const statuses of [null, POST_REQUEST_HOME_ACTIVE_STATUSES]) {
    const requests = root.getLinkedRecords('postRequests', { profileId, statuses });
    if (!requests || requests.some((item) => item?.getDataID() === requestNodeId)) {
      continue;
    }

    root.setLinkedRecords([request, ...requests], 'postRequests', { profileId, statuses });
  }
}

export function removePostRequestFromHomeRequests(
  store: RecordSourceSelectorProxy,
  profileId: string,
  requestNodeId: string,
) {
  const root = store.getRoot();
  const args = {
    profileId,
    statuses: POST_REQUEST_HOME_ACTIVE_STATUSES,
  };
  const requests = root.getLinkedRecords('postRequests', args);
  if (!requests) {
    return;
  }

  root.setLinkedRecords(
    requests.filter((request) => request?.getDataID() !== requestNodeId),
    'postRequests',
    args,
  );
}

export function reconcilePublishedPostInHome(
  store: RecordSourceSelectorProxy,
  {
    authorProfileId,
    currentProfileId,
    postId,
    profileId,
    requestNodeId,
  }: Readonly<{
    authorProfileId: string | null;
    currentProfileId: string | null;
    postId: string | null;
    profileId: string;
    requestNodeId: string;
  }>,
) {
  removePostRequestFromHomeRequests(store, profileId, requestNodeId);

  if (!postId || !authorProfileId || authorProfileId !== currentProfileId) {
    return;
  }

  const post = store.get(postId);
  const homeConnection = ConnectionHandler.getConnection(store.getRoot(), 'PostList_homeTimeline');
  if (!post || !homeConnection) {
    return;
  }

  const alreadyPresent = (homeConnection.getLinkedRecords('edges') ?? []).some(
    (edge) => edge?.getLinkedRecord('node')?.getDataID() === postId,
  );
  if (alreadyPresent) {
    return;
  }

  const edge = ConnectionHandler.createEdge(store, homeConnection, post, 'PostConnectionEdge');
  ConnectionHandler.insertEdgeBefore(homeConnection, edge);
}
