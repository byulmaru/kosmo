import AsyncStorage from '@react-native-async-storage/async-storage';

export const PUSH_PROMPT_COMPLETE_KEY = '@kosmo/native-push/prompt-complete';
export const PUSH_INSTALLATION_ID_KEY = '@kosmo/native-push/installation-id';

export async function readPushPromptComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(PUSH_PROMPT_COMPLETE_KEY)) === '1';
}

export async function markPushPromptComplete(): Promise<void> {
  await AsyncStorage.setItem(PUSH_PROMPT_COMPLETE_KEY, '1');
}

export async function readPushInstallationId(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY);
}

export async function writePushInstallationId(id: string): Promise<void> {
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, id);
}

export async function deletePushInstallationId(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_INSTALLATION_ID_KEY);
}
