import { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { serve } from '@hono/node-server';
import { db, Files, firstOrThrowWith } from '@kosmo/db';
import { FileOwnership, FileState } from '@kosmo/enum';
import { env } from '@kosmo/env';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { base64 } from 'rfc4648';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import { match } from 'ts-pattern';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

const MAX_REMOTE_FILE_SIZE = 16 * 1024 * 1024; // 16MB
const FETCH_TIMEOUT = 30000; // 30초

const s3Client = new S3Client({
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
});

async function generatePlaceholder(img: sharp.Sharp, fileId: string) {
  const raw = await img
    .clone()
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const placeholder = base64.stringify(rgbaToThumbHash(raw.info.width, raw.info.height, raw.data));

  return db.update(Files).set({ placeholder }).where(eq(Files.id, fileId));
}

app.get('/:fileId/:option', async (c) => {
  const fileId = c.req.param('fileId');
  const option = c.req.param('option');

  if (option !== 'original' && option !== 'thumbnail') {
    return c.notFound();
  }

  const file = await db
    .select({
      id: Files.id,
      path: Files.path,
      ownership: Files.ownership,
      placeholder: Files.placeholder,
      transform: Files.transform,
      processed: Files.processed,
    })
    .from(Files)
    .where(and(eq(Files.id, fileId), eq(Files.state, FileState.PERMANENT)))
    .limit(1)
    .then(firstOrThrowWith(() => new HTTPException(404)));

  let originalStream: ReadableStream;

  // 이미지 데이터 가져오기
  if (file.ownership === FileOwnership.LOCAL) {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: 'kosmo-media',
        Key: file.path,
      }),
    );

    if (!response.Body) {
      return c.notFound();
    }

    originalStream = response.Body.transformToWebStream();
  } else {
    try {
      const response = await fetch(file.path, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!response.ok) {
        return c.notFound();
      }

      // Content-Length 체크
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_REMOTE_FILE_SIZE) {
        return c.text('File too large', 413);
      }

      if (!response.body) {
        return c.notFound();
      }

      // 스트림에 크기 제한을 추가하는 TransformStream
      let totalSize = 0;
      const limitTransform = new TransformStream({
        transform(chunk: Uint8Array, controller) {
          totalSize += chunk.length;
          if (totalSize > MAX_REMOTE_FILE_SIZE) {
            controller.error(new Error('File too large'));
            return;
          }
          controller.enqueue(chunk);
        },
      });

      originalStream = response.body.pipeThrough(limitTransform);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return c.text('Request timeout', 408);
      }
      throw error;
    }
  }

  let img = sharp({ animated: true }).webp();
  // @ts-expect-error ReadableStream 시그니처 추론 문제?
  Readable.fromWeb(originalStream).pipe(img);

  if (file.transform?.width || file.transform?.height) {
    img = img.resize(file.transform.width, file.transform.height, {
      fit: 'cover',
      withoutEnlargement: true,
    });
  }

  if (file.processed === false) {
    new Upload({
      client: s3Client,
      params: {
        Bucket: 'kosmo-media',
        Key: file.path,
        Body: img.clone(),
        ContentType: 'image/webp',
      },
    })
      .done()
      .then(() =>
        s3Client.send(
          new HeadObjectCommand({
            Bucket: 'kosmo-media',
            Key: file.path,
          }),
        ),
      )
      .then((headResponse) =>
        db
          .update(Files)
          .set({ size: headResponse.ContentLength, processed: true })
          .where(eq(Files.id, file.id)),
      )
      .catch((error) => {
        console.error('S3 upload or size update failed:', error);
      });
  }

  const responseStream = Readable.toWeb(
    match(option)
      .with('original', () => img)
      .with('thumbnail', () =>
        img.clone().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }),
      )
      .exhaustive(),
  );

  if (!file.placeholder) {
    generatePlaceholder(img, file.id);
  }

  return new Response(responseStream as ReadableStream, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=2592000, immutable',
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
