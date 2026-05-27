import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';

type R2Config = {
  bucket: string;
  publicBaseUrl: string;
  s3: S3Client;
};

let r2Config: Promise<R2Config> | undefined;

const getR2Config = () => {
  r2Config ??= import('@kosmo/core/env').then(({ env }) => ({
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL.replace(/\/+$/, ''),
    s3: new S3Client({
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      endpoint: env.R2_ENDPOINT,
      region: 'auto',
    }),
  }));

  return r2Config;
};

export const getPublicUrl = async (key: string) => {
  const { publicBaseUrl } = await getR2Config();
  return `${publicBaseUrl}/${key}`;
};

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
  const { bucket, s3 } = await getR2Config();

  await s3.send(
    new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
      ContentType: contentType,
      Key: key,
    }),
  );
};

export const deleteR2Object = async (key: string) => {
  const { bucket, s3 } = await getR2Config();

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
};
