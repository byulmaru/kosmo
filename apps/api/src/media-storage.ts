import { z } from 'zod';

const representationResponseSchema = z.object({
  mediaType: z.string().trim().min(1),
  url: z.httpUrl(),
});

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

export const getMediaStorageRepresentation = async (
  storageReference: string,
  signal?: AbortSignal,
): Promise<{ readonly mediaType: string; readonly url: string }> => {
  const mediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const mediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  if (!mediaStorageOrigin || !mediaStorageApiKey) {
    throw new Error('Media Storage Service is not configured');
  }

  const representationPath = `/v1/uploads/${encodeURIComponent(storageReference)}`;
  const representationUrl = new URL(representationPath, mediaStorageOrigin);
  if (representationUrl.pathname !== representationPath) {
    throw new Error('Media Storage Service returned an unsafe upload reference');
  }

  const timeout = AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS);
  const response = await globalThis.fetch(representationUrl, {
    headers: { Authorization: `Bearer ${mediaStorageApiKey}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (response.status === 404) {
    throw new Error('Media upload is not complete');
  }
  if (response.status !== 200) {
    throw new Error(`Media Storage Service rejected representation lookup (${response.status})`);
  }
  const representation = representationResponseSchema.safeParse(await response.json());
  if (!representation.success) {
    throw new Error('Media Storage Service returned an invalid representation');
  }
  return representation.data;
};
