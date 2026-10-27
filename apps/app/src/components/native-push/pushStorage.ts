import AsyncStorage from '@react-native-async-storage/async-storage';

export const PUSH_INSTALLATION_ID_KEY = '@kosmo/native-push/installation-id';
export const LAST_NOTIFIED_OTA_UPDATE_ID_KEY = '@kosmo/native-updates/last-notified-update-id';

export async function readPushInstallationId(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY);
}

export async function writePushInstallationId(id: string): Promise<void> {
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, id);
}

export async function deletePushInstallationId(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_INSTALLATION_ID_KEY);
}

export async function readLastNotifiedOtaUpdateId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_NOTIFIED_OTA_UPDATE_ID_KEY);
}

export async function writeLastNotifiedOtaUpdateId(updateId: string): Promise<void> {
  await AsyncStorage.setItem(LAST_NOTIFIED_OTA_UPDATE_ID_KEY, updateId);
}
