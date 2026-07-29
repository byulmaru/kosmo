export const postComposerMediaLimit = 4;

export function takeComposerMediaSelection<T>(
  existingCount: number,
  assets: readonly T[],
): readonly T[] {
  return assets.slice(0, Math.max(0, postComposerMediaLimit - existingCount));
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
  const { mediaId, uploadUrl } = await issue();
  if (!isActive()) {
    return null;
  }

  await put(uploadUrl);
  if (!isActive()) {
    return null;
  }

  await complete(mediaId);
  return isActive() ? mediaId : null;
}
