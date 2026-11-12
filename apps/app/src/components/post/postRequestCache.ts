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
