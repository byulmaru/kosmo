import 'temporal-polyfill/global';

import { randomUUID } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ValidationError } from './error';
import { MEDIA_UPLOAD_MAX_BYTES } from './temporal/media-upload';

const MEDIA_UPLOAD_REFERENCE_PREFIX = 'nexus:v1:';
const MEDIA_UPLOAD_PUT_URL_TTL_SECONDS = 600;
const MEDIA_UPLOAD_SOURCE_TTL_MS = 24 * 60 * 60 * 1000;
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

export const issueNexusMediaUploadPutUrl = async (
  contentLength: number,
): Promise<{
  storageReference: string;
  uploadUrl: string;
  expiresAt: Temporal.Instant;
}> => {
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > MEDIA_UPLOAD_MAX_BYTES
  ) {
    throw new ValidationError('Media upload size must be between 1 byte and 16 MiB');
  }

  const uuid = randomUUID();
  const storageReference = `${MEDIA_UPLOAD_REFERENCE_PREFIX}${uuid}`;
  const id = `u_${uuid}`;
  const sourceKey = `uploads/${id}/${uuid}`;
  const config = getStagingR2Config();
  const client = createStagingR2Client(config);
  let uploadUrl: string;
  try {
    uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: config.bucket, ContentLength: contentLength, Key: sourceKey }),
      { expiresIn: MEDIA_UPLOAD_PUT_URL_TTL_SECONDS },
    );
  } finally {
    client.destroy();
  }

  return {
    storageReference,
    uploadUrl,
    expiresAt: Temporal.Now.instant().add({ seconds: MEDIA_UPLOAD_PUT_URL_TTL_SECONDS }),
  };
};

export const headNexusMediaUploadSource = async (
  storageReference: string,
): Promise<NexusMediaUploadSession & { contentType: NexusMediaUploadContentType }> => {
  const session = parseNexusMediaUploadReference(storageReference);
  if (!session) {
    throw new ValidationError('Media upload source metadata is invalid');
  }

  const config = getStagingR2Config();
  const client = createStagingR2Client(config);
  let metadata;
  try {
    metadata = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: session.sourceKey }),
    );
  } catch (error) {
    if (isNotFound(error)) {
      throw new ValidationError('Media upload source is missing');
    }
    throw error;
  } finally {
    client.destroy();
  }

  if (
    typeof metadata.ContentLength !== 'number' ||
    !Number.isSafeInteger(metadata.ContentLength) ||
    metadata.ContentLength < 0
  ) {
    throw new ValidationError('Media upload source metadata is invalid');
  }
  if (metadata.ContentLength > MEDIA_UPLOAD_MAX_BYTES) {
    throw new ValidationError('Media upload source exceeds the maximum size');
  }
  if (!metadata.LastModified || !Number.isFinite(metadata.LastModified.getTime())) {
    throw new ValidationError('Media upload source metadata is invalid');
  }
  if (Date.now() >= metadata.LastModified.getTime() + MEDIA_UPLOAD_SOURCE_TTL_MS) {
    throw new ValidationError('Media upload source has expired');
  }

  const contentType = metadata.ContentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!contentType) {
    throw new ValidationError('Media upload source metadata is invalid');
  }
  const validatedContentType = MEDIA_UPLOAD_CONTENT_TYPES.find((type) => type === contentType);
  if (!validatedContentType) {
    throw new ValidationError('Media upload source has an unsupported content type');
  }

  return { ...session, contentType: validatedContentType };
};

const getStagingR2Config = () => {
  const endpoint = process.env.MEDIA_STAGING_R2_ENDPOINT;
  const bucket = process.env.MEDIA_STAGING_R2_BUCKET;
  const accessKeyId = process.env.MEDIA_STAGING_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Media staging R2 is not configured');
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error('MEDIA_STAGING_R2_ENDPOINT must be a valid URL');
  }
  if (
    endpointUrl.protocol !== 'https:' &&
    !(
      endpointUrl.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(endpointUrl.hostname)
    )
  ) {
    throw new Error('MEDIA_STAGING_R2_ENDPOINT must use HTTPS');
  }

  return { accessKeyId, bucket, endpoint, secretAccessKey };
};

type StagingR2Config = ReturnType<typeof getStagingR2Config>;

const createStagingR2Client = ({ accessKeyId, endpoint, secretAccessKey }: StagingR2Config) => {
  return new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region: 'auto',
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
};

const isNotFound = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const sdkError = error as Error & { $metadata?: { httpStatusCode?: number } };
  return (
    sdkError.$metadata?.httpStatusCode === 404 ||
    sdkError.name === 'NoSuchKey' ||
    sdkError.name === 'NotFound'
  );
};
