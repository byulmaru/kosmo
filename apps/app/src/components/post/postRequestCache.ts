import { ConnectionHandler } from 'relay-runtime';
import type { RecordSourceSelectorProxy } from 'relay-runtime';

export const POST_REQUEST_HOME_ACTIVE_STATUSES = [
  'CONFIRMING',
  'FAILED',
  'PROCESSING',
  'PUBLISHING',
  'QUEUED',
] as const;

export function prependPostRequestToLoadedPages(
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
    const page = root.getLinkedRecord('postRequests', { pageToken: null, profileId, statuses });
    const requests = page?.getLinkedRecords('requests');
    if (!page || !requests || requests.some((item) => item?.getDataID() === requestNodeId)) {
      continue;
    }

    page.setLinkedRecords([request, ...requests], 'requests');
  }
}

export function removePostRequestFromHomePage(
  store: RecordSourceSelectorProxy,
  profileId: string,
  requestNodeId: string,
) {
  const page = store.getRoot().getLinkedRecord('postRequests', {
    pageToken: null,
    profileId,
    statuses: POST_REQUEST_HOME_ACTIVE_STATUSES,
  });
  const requests = page?.getLinkedRecords('requests');
  if (!page || !requests) {
    return;
  }

  page.setLinkedRecords(
    requests.filter((request) => request?.getDataID() !== requestNodeId),
    'requests',
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
  removePostRequestFromHomePage(store, profileId, requestNodeId);

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
