import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@kosmo/core/env';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';

const r2Config = {
  bucket: env.R2_BUCKET,
  publicBaseUrl: env.R2_PUBLIC_BASE_URL.replace(/\/+$/, ''),
};

const s3 = new S3Client({
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: env.R2_ENDPOINT,
  region: 'auto',
});

export const getPublicUrl = (key: string) => `${r2Config.publicBaseUrl}/${key}`;

export const uploadR2Object = async ({
  body,
  contentLength,
  contentType,
  key,
}: {
  body: PutObjectCommandInput['Body'];
  contentLength?: number;
  contentType: string;
  key: string;
}) => {
  await s3.send(
    new PutObjectCommand({
      Body: body,
      Bucket: r2Config.bucket,
      ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
      ContentType: contentType,
      Key: key,
    }),
  );
};

export const deleteR2Object = async (key: string) => {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
    }),
  );
};
