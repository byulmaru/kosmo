import { asImageUploadError, assertImageUploadResponse } from './imageUploadErrors';
import type { ImagePickerAsset } from 'expo-image-picker';

type IssuedImageUpload = {
  readonly mediaId: string;
  readonly uploadUrl: string;
};

async function putImagePickerAsset(uploadUrl: string, asset: ImagePickerAsset): Promise<void> {
  const body = asset.file ?? (await (await fetch(asset.uri)).blob());
  const response = await fetch(uploadUrl, {
    body,
    headers: asset.mimeType ? { 'content-type': asset.mimeType } : undefined,
    method: 'PUT',
  });
  await assertImageUploadResponse(response);
}

export function releaseImagePreview(
  uri: string,
  revokeObjectUrl: (url: string) => void = URL.revokeObjectURL,
): void {
  if (uri.startsWith('blob:')) {
    revokeObjectUrl(uri);
  }
}

export async function uploadImage({
  asset,
  complete,
  isActive,
  issue,
}: {
  readonly asset: ImagePickerAsset;
  readonly complete: (mediaId: string) => Promise<void>;
  readonly isActive: () => boolean;
  readonly issue: () => Promise<IssuedImageUpload>;
}): Promise<string | null> {
  if (!isActive()) {
    return null;
  }

  let issued: IssuedImageUpload;
  try {
    issued = await issue();
  } catch (error) {
    throw asImageUploadError(error, 'issue');
  }
  if (!isActive()) {
    return null;
  }

  try {
    await putImagePickerAsset(issued.uploadUrl, asset);
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
