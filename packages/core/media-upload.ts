import { ValidationError } from './error';
import { MEDIA_UPLOAD_MAX_BYTES } from './temporal/media-upload';

const MEDIA_UPLOAD_REFERENCE_PREFIX = 'nexus:v1:';
const MEDIA_UPLOAD_SOURCE_TTL_MS = 24 * 60 * 60 * 1000;
const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;
const MEDIA_UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type NexusMediaUploadContentType = (typeof MEDIA_UPLOAD_CONTENT_TYPES)[number];
export type NexusMediaUploadSession = {
  id: string;
  sourceKey: string;
};

export const isNexusMediaUpload = (storageReference: string | null): boolean =>
  storageReference?.startsWith(MEDIA_UPLOAD_REFERENCE_PREFIX) ?? false;

export const parseNexusMediaUploadReference = (
  storageReference: string,
): NexusMediaUploadSession | null => {
  if (!isNexusMediaUpload(storageReference)) {
    return null;
  }

  const uuid = storageReference.slice(MEDIA_UPLOAD_REFERENCE_PREFIX.length);
  if (!UUID_V4_PATTERN.test(uuid)) {
    return null;
  }

  const id = `u_${uuid}`;
  return { id, sourceKey: `uploads/${id}/${uuid}` };
};

export const headNexusMediaUploadSource = async (
  storageReference: string,
): Promise<NexusMediaUploadSession & { contentType: NexusMediaUploadContentType }> => {
  const session = parseNexusMediaUploadReference(storageReference);
  if (!session) {
    throw new ValidationError('Media upload source metadata is invalid');
  }

  const mediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const mediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  if (!mediaStorageOrigin || !mediaStorageApiKey) {
    throw new Error('Media Storage Service is not configured');
  }

  const response = await globalThis.fetch(
    new URL(`/v1/uploads/${session.id}?staging=true`, mediaStorageOrigin),
    {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${mediaStorageApiKey}` },
      signal: AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS),
    },
  );
  if (response.status === 404) {
    throw new ValidationError('Media upload source is missing');
  }
  if (response.status !== 200) {
    throw new Error(`Media Storage Service rejected upload metadata (${response.status})`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = Number(contentLengthHeader);
  if (
    contentLengthHeader === null ||
    !/^\d+$/.test(contentLengthHeader) ||
    !Number.isSafeInteger(contentLength) ||
    contentLength < 0
  ) {
    throw new ValidationError('Media upload source metadata is invalid');
  }
  if (contentLength > MEDIA_UPLOAD_MAX_BYTES) {
    throw new ValidationError('Media upload source exceeds the maximum size');
  }

  const lastModifiedHeader = response.headers.get('last-modified');
  const lastModified = lastModifiedHeader === null ? Number.NaN : Date.parse(lastModifiedHeader);
  if (!Number.isFinite(lastModified)) {
    throw new ValidationError('Media upload source metadata is invalid');
  }
  if (Date.now() >= lastModified + MEDIA_UPLOAD_SOURCE_TTL_MS) {
    throw new ValidationError('Media upload source has expired');
  }

  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!contentType) {
    throw new ValidationError('Media upload source metadata is invalid');
  }
  const validatedContentType = MEDIA_UPLOAD_CONTENT_TYPES.find((type) => type === contentType);
  if (!validatedContentType) {
    throw new ValidationError('Media upload source has an unsupported content type');
  }

  return { ...session, contentType: validatedContentType };
};
