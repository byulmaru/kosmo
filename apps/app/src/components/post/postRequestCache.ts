import { ConnectionHandler } from 'relay-runtime';
import type { RecordSourceSelectorProxy } from 'relay-runtime';

export const POST_REQUEST_HOME_ACTIVE_STATUSES = [
  'CONFIRMING',
  'FAILED',
  'PROCESSING',
  'PUBLISHING',
  'QUEUED',
] as const;

export function prependPostRequestToLoadedProfileRequests(
  store: RecordSourceSelectorProxy,
  profileId: string,
  requestNodeId: string,
) {
  const request = store.get(requestNodeId);
  const profile = store.get(profileId);
  if (
    !request ||
    !profile ||
    profile.getType() !== 'Profile' ||
    request.getValue('status') === 'PUBLISHED'
  ) {
    return;
  }

  const requests = profile.getLinkedRecords('postRequests');
  if (!requests || requests.some((item) => item?.getDataID() === requestNodeId)) {
    return;
  }

  profile.setLinkedRecords([request, ...requests], 'postRequests');
}

export function removePostRequestFromLoadedProfileRequests(
  store: RecordSourceSelectorProxy,
  profileId: string,
  requestNodeId: string,
) {
  const profile = store.get(profileId);
  if (!profile || profile.getType() !== 'Profile') {
    return;
  }

  const requests = profile.getLinkedRecords('postRequests');
  if (!requests) {
    return;
  }

  const nextRequests = requests.filter((request) => request?.getDataID() !== requestNodeId);
  if (nextRequests.length !== requests.length) {
    profile.setLinkedRecords(nextRequests, 'postRequests');
  }
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
    requestNodeId?: string;
  }>,
) {
  if (requestNodeId) {
    removePostRequestFromLoadedProfileRequests(store, profileId, requestNodeId);
  }

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
