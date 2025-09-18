import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { zValidator } from '@hono/zod-validator';
import { dayjs } from '@kosmo/dayjs';
import { createDbId, db, Files, TableCode } from '@kosmo/db';
import { FileOwnership, FileState } from '@kosmo/enum';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@/env';
import type { Env } from '@/context';

export const upload = new Hono<Env>();

const MAX_ORIGINAL_FILE_SIZE = 16 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];

const s3Client = new S3Client({
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
});

upload.post(
  '/',
  zValidator(
    'form',
    z.object({
      file: z
        .instanceof(File)
        .refine((file) => file.size <= MAX_ORIGINAL_FILE_SIZE)
        .refine((file) => ALLOWED_FILE_TYPES.includes(file.type)),
    }),
  ),
  async (c) => {
    if (!c.var.context.session) {
      return c.json({ code: 'error.unauthorized' }, 401);
    }

    const { file } = c.req.valid('form');
    const fileId = createDbId(TableCode.Files);
    const key = `${dayjs().format('YY/MM')}/${fileId}`;

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: 'kosmo-media',
        Key: key,
        Body: file.stream(),
        ContentType: file.type,
      },
    });

    await upload.done();

    await db.insert(Files).values({
      id: fileId,
      accountId: c.var.context.session.accountId,
      ownership: FileOwnership.LOCAL,
      state: FileState.EPHEMERAL,
      path: key,
      size: file.size,
      expiresAt: dayjs().add(1, 'day'),
    });

    return c.json({
      fileId,
    });
  },
);
