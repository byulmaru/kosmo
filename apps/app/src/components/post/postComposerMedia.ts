import { asImageUploadError } from '@/components/media/imageUploadErrors';

export const postComposerMediaLimit = 4;

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
