import { ConnectionHandler } from 'relay-runtime';
import type { RecordSourceProxy } from 'relay-runtime';

export const profileMuteConnectionKey = 'SettingsMutedProfiles_profileMutes';

export function getProfileMuteConnectionId(ownerProfileId: string) {
  return ConnectionHandler.getConnectionID(ownerProfileId, profileMuteConnectionKey);
}

export function addProfileMuteToStore(
  store: RecordSourceProxy,
  ownerProfileId: string,
  profileMuteId: string,
  targetProfileId: string,
) {
  const profileMute = store.get(profileMuteId);
  if (!profileMute) {
    return;
  }

  const targetProfile = store.get(targetProfileId);
  const viewerState = targetProfile?.getLinkedRecord('viewerState');
  viewerState?.setLinkedRecord(profileMute, 'profileMute');

  const connection = store.get(getProfileMuteConnectionId(ownerProfileId));
  if (!connection) {
    return;
  }

  const existingEdge = connection
    .getLinkedRecords('edges')
    ?.some((edge) => edge?.getLinkedRecord('node')?.getDataID() === profileMuteId);
  if (existingEdge) {
    return;
  }

  const edge = ConnectionHandler.createEdge(
    store,
    connection,
    profileMute,
    'ProfileMuteConnectionEdge',
  );
  ConnectionHandler.insertEdgeBefore(connection, edge);
}

export function removeProfileMuteFromStore(
  store: RecordSourceProxy,
  ownerProfileId: string,
  profileMuteId: string,
  targetProfileId: string,
) {
  const connection = store.get(getProfileMuteConnectionId(ownerProfileId));
  if (connection) {
    ConnectionHandler.deleteNode(connection, profileMuteId);
  }

  const targetProfile = store.get(targetProfileId);
  const viewerState = targetProfile?.getLinkedRecord('viewerState');
  if (viewerState?.getLinkedRecord('profileMute')?.getDataID() === profileMuteId) {
    viewerState.setValue(null, 'profileMute');
  }
  store.delete(profileMuteId);
}
