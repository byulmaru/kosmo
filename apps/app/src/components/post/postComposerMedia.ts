import type { ImagePickerAsset } from 'expo-image-picker';

export const postComposerMediaLimit = 4;

export type ComposerClipboardItem = Pick<DataTransferItem, 'getAsFile' | 'kind' | 'type'>;

export function getClipboardImageFiles(
  items: Iterable<ComposerClipboardItem> | null | undefined,
): File[] {
  if (!items) {
    return [];
  }

  return Array.from(items).flatMap((item) => {
    if (item.kind !== 'file' || !item.type.toLowerCase().startsWith('image/')) {
      return [];
    }

    const file = item.getAsFile();
    return file && file.type.toLowerCase().startsWith('image/') ? [file] : [];
  });
}

export function takeAvailableComposerMedia<T>(
  assets: readonly T[],
  currentCount: number,
): readonly T[] {
  return assets.slice(0, Math.max(0, postComposerMediaLimit - currentCount));
}

export function createClipboardMediaAsset(
  file: File,
  createObjectUrl: (file: File) => string = (value) => URL.createObjectURL(value),
): ImagePickerAsset {
  return {
    file,
    height: 0,
    mimeType: file.type,
    uri: createObjectUrl(file),
    width: 0,
  };
}
