import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { serve } from '@hono/node-server';
import { db, Files, firstOrThrowWith } from '@kosmo/db';
import { FileState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import sharp from 'sharp';
import { env } from './env';

const app = new Hono();

const s3Client = new S3Client({
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
});

app.get('/:fileId', async (c) => {
  const fileId = c.req.param('fileId');

  const file = await db
    .select({
      id: Files.id,
      path: Files.path,
    })
    .from(Files)
    .where(and(eq(Files.id, fileId), eq(Files.state, FileState.PERMANENT)))
    .limit(1)
    .then(firstOrThrowWith(() => new HTTPException(404)));

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: 'kosmo-media',
      Key: file.path,
    }),
  );

  if (!response.Body) {
    return c.notFound();
  }

  let byteArray = await response.Body.transformToByteArray();

  if (response.ContentType !== 'image/webp') {
    const result = await sharp(byteArray, { animated: true })
      .webp()
      .toBuffer({ resolveWithObject: true });

    byteArray = result.data;

    s3Client
      .send(
        new PutObjectCommand({
          Bucket: 'kosmo-media',
          Key: file.path,
          Body: result.data,
          ContentType: 'image/webp',
        }),
      )
      .then(() => db.update(Files).set({ size: result.info.size }).where(eq(Files.id, file.id)))
      .then(() => null);
  }

  // @ts-expect-error 근데정말왜타입에러가나지????
  return new Response(byteArray, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
});

serve(
  {
    fetch: app.fetch,
    port: 8262,
  },
  (info) => {
    console.log(`Image server running on port ${info.port}`);
  },
);
