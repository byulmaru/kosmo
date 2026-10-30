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
