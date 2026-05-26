import { randomUUID } from 'node:crypto';
import { sValidator } from '@hono/standard-validator';
import { db, Files, Media } from '@kosmo/core/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { deleteR2Object, getPublicUrl, uploadR2Object } from '../utils/r2';
import type { Env } from '../context';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export const upload = new Hono<Env>();

const jsonError = (message: string) => ({ error: message });

const uploadFormSchema = z.object({
  image: z
    .instanceof(File, { error: 'image file is required' })
    .refine((image) => image.size <= MAX_UPLOAD_SIZE, 'image is too large')
    .refine((image) => image.type.startsWith('image/'), 'image file is required'),
});

const getExtension = (file: File) => {
  const byType = file.type.split('/')[1];
  const byName = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1];

  return (byType || byName || 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
};

const getObjectKey = (file: File) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `uploads/${year}/${month}/${randomUUID()}.${getExtension(file)}`;
};

const cleanupUploadedObjects = async (keys: string[]) => {
  await Promise.allSettled(keys.map((key) => deleteR2Object(key)));
};

upload.post(
  '/upload',
  sValidator('form', uploadFormSchema, (result, c) => {
    if (result.success) {
      return;
    }

    const issue = result.error[0];
    const message = issue?.message ?? 'image file is required';

    return c.json(jsonError(message), message === 'image is too large' ? 413 : 400);
  }),
  async (c) => {
    const { session } = c.get('context');
    if (!session) {
      return c.json(jsonError('Authentication required'), 401);
    }

    const { image } = c.req.valid('form');
    const key = getObjectKey(image);
    const url = getPublicUrl(key);

    try {
      await uploadR2Object({
        body: image.stream(),
        contentLength: image.size,
        contentType: image.type,
        key,
      });
    } catch {
      return c.json(jsonError('failed to upload image'), 502);
    }

    try {
      const mediaId = await db.transaction(async (tx) => {
        const [file] = await tx
          .insert(Files)
          .values({
            byteSize: image.size,
            mimeType: image.type,
            sha256: null,
            storageKey: key,
            url,
          })
          .returning({ id: Files.id });

        if (!file) {
          throw new Error('failed to insert file');
        }

        const [media] = await tx
          .insert(Media)
          .values({
            accountId: session.accountId,
            originalFileId: file.id,
            profileId: session.profileId,
            source: 'LOCAL',
          })
          .returning({ id: Media.id });

        if (!media) {
          throw new Error('failed to insert media');
        }

        return media.id;
      });

      return c.json(
        {
          contentType: image.type,
          id: mediaId,
          key,
          url,
        },
        201,
      );
    } catch {
      await cleanupUploadedObjects([key]);

      return c.json(jsonError('failed to persist image'), 500);
    }
  },
);
