import * as Clipboard from 'expo-clipboard';

export type ClipboardWriter = (value: string) => Promise<boolean>;

export const copyToClipboard: ClipboardWriter = async (value) => {
  try {
    await Clipboard.setStringAsync(value);
    return true;
  } catch {
    return false;
  }
};
