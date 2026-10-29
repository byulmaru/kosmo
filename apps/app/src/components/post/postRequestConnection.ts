import { ConnectionHandler } from 'relay-runtime';

export const POST_REQUEST_HOME_ACTIVE_STATUSES = [
  'CONFIRMING',
  'FAILED',
  'PROCESSING',
  'PUBLISHING',
  'QUEUED',
] as const;

export function getPostRequestConnectionIds(accountId: string | null, profileId: string) {
  if (!accountId) {
    return [];
  }

  const connectionKey = 'PostRequestList_postRequests';
  return [
    ConnectionHandler.getConnectionID(accountId, connectionKey, { profileId, statuses: null }),
    ConnectionHandler.getConnectionID(accountId, connectionKey, {
      profileId,
      statuses: POST_REQUEST_HOME_ACTIVE_STATUSES,
    }),
  ];
}
