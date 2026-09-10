import { ConnectionHandler } from 'relay-runtime';
import type { RecordProxy, RecordSourceProxy } from 'relay-runtime';

export const profileBlockConnectionKey = 'SettingsBlockedProfiles_profileBlocks';

export function getProfileBlockConnectionId(ownerProfileId: string) {
  return ConnectionHandler.getConnectionID(ownerProfileId, profileBlockConnectionKey);
}

export function addProfileBlockToStore(
  store: RecordSourceProxy,
  ownerProfileId: string,
  profileBlockId: string,
) {
  const profileBlock = store.get(profileBlockId);
  const connection = store.get(getProfileBlockConnectionId(ownerProfileId));
  if (!profileBlock || !connection) {
    return;
  }

  const existingEdge = connection
    .getLinkedRecords('edges')
    ?.some((edge) => edge?.getLinkedRecord('node')?.getDataID() === profileBlockId);
  if (existingEdge) {
    return;
  }

  const edge = ConnectionHandler.createEdge(
    store,
    connection,
    profileBlock,
    'ProfileBlockConnectionEdge',
  );
  ConnectionHandler.insertEdgeBefore(connection, edge);
}

export function removeProfileBlockFromStore(
  store: RecordSourceProxy,
  ownerProfileId: string,
  profileBlockId: string,
) {
  const connection = store.get(getProfileBlockConnectionId(ownerProfileId));
  if (connection) {
    ConnectionHandler.deleteNode(connection, profileBlockId);
  }

  store.delete(profileBlockId);
}

export function updateProfileBlockStatus(
  store: RecordSourceProxy,
  handle: string | null | undefined,
  status: { blocking: boolean; profileBlockId: string | null },
) {
  if (!handle) {
    return;
  }

  const statusRecord = store
    .getRoot()
    .getLinkedRecord('profileBlockStatus', { handle }) as RecordProxy | null;
  statusRecord?.setValue(status.blocking, 'blocking');
  statusRecord?.setValue(status.profileBlockId, 'profileBlockId');
}
