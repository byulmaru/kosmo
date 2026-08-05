import { asImageUploadError } from '@/components/media/imageUploadErrors';
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

export function releaseComposerMediaPreview(
  uri: string,
  revokeObjectUrl: (url: string) => void = URL.revokeObjectURL,
) {
  if (uri.startsWith('blob:')) {
    revokeObjectUrl(uri);
  }
}

export async function uploadComposerMedia({
  complete,
  isActive,
  issue,
  put,
}: {
  readonly complete: (mediaId: string) => Promise<void>;
  readonly isActive: () => boolean;
  readonly issue: () => Promise<{ readonly mediaId: string; readonly uploadUrl: string }>;
  readonly put: (uploadUrl: string) => Promise<void>;
}): Promise<string | null> {
  if (!isActive()) {
    return null;
  }

  let issued: { readonly mediaId: string; readonly uploadUrl: string };
  try {
    issued = await issue();
  } catch (error) {
    throw asImageUploadError(error, 'issue');
  }
  if (!isActive()) {
    return null;
  }

  try {
    await put(issued.uploadUrl);
  } catch (error) {
    throw asImageUploadError(error, 'transfer');
  }
  if (!isActive()) {
    return null;
  }

  try {
    await complete(issued.mediaId);
  } catch (error) {
    throw asImageUploadError(error, 'complete');
  }
  return isActive() ? issued.mediaId : null;
}
