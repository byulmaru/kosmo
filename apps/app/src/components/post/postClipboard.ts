import * as Clipboard from 'expo-clipboard';

export function setStringAsync(value: string): Promise<boolean> {
  return Clipboard.setStringAsync(value);
}
