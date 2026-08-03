import { ConnectionHandler } from 'relay-runtime';
import type { RecordSourceProxy } from 'relay-runtime';

export function removeFollowRequestFromConnection(
  store: RecordSourceProxy,
  connectionId: string,
  requestId: string,
) {
  const connection = store.get(connectionId);

  if (connection) {
    ConnectionHandler.deleteNode(connection, requestId);
  }
  store.delete(requestId);
}
