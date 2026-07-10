import { randomUUID } from 'node:crypto';
import { sValidator } from '@hono/standard-validator';
import { db, Files, firstOrThrowWith, Media } from '@kosmo/core/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { deleteR2Object, getPublicUrl, uploadR2Object } from '../utils/r2';
import type { Context } from 'hono';
import type { Env } from '../context';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const MAX_UPLOAD_BODY_SIZE = 64 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const upload = new Hono<Env>();

const jsonError = (message: string) => ({ error: message });

const uploadFormSchema = z.object({
  image: z
    .instanceof(File, { error: 'image file is required' })
    .refine((image) => image.size <= MAX_UPLOAD_SIZE, 'image is too large')
    .refine((image) => ALLOWED_IMAGE_MIME_TYPES.includes(image.type), 'image file is required'),
});

const getObjectKey = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `uploads/${year}/${month}/${randomUUID()}`;
};

const cleanupUploadedObjects = async (keys: string[]) => {
  await Promise.allSettled(keys.map((key) => deleteR2Object(key)));
};

const getUploadSession = (c: Context<Env>) => {
  const { session } = c.get('context');
  if (!session?.profileId) {
    throw new Error('upload session middleware is required');
  }

  return {
    accountId: session.accountId,
    profileId: session.profileId,
  };
};

upload.post(
  '/upload',
  async (c, next) => {
    const { session } = c.get('context');
    if (!session) {
      return c.json(jsonError('Authentication required'), 401);
    }
    if (!session.profileId) {
      return c.json(jsonError('Profile selection required'), 403);
    }

    await next();
  },
  bodyLimit({
    maxSize: MAX_UPLOAD_BODY_SIZE,
    onError: (c) => c.json(jsonError('image is too large'), 413),
  }),
  sValidator('form', uploadFormSchema, (result, c) => {
    if (result.success) {
      return;
    }

    const issue = result.error[0];
    const message = issue?.message ?? 'image file is required';

    return c.json(jsonError(message), message === 'image is too large' ? 413 : 400);
  }),
  async (c) => {
    const { accountId, profileId } = getUploadSession(c);
    const { image } = c.req.valid('form');
    const key = getObjectKey();

    try {
      await uploadR2Object({
        body: image.stream(),
        contentLength: image.size,
        contentType: image.type,
        key,
      });
    }
    catch {
      return c.json(jsonError('failed to upload image'), 502);
    }

    const url = await getPublicUrl(key);

    try {
      const mediaId = await db.transaction(async (tx) => {
        const file = await tx
          .insert(Files)
          .values({
            byteSize: image.size,
            mimeType: image.type,
            sha256: null,
            storageKey: key,
          })
          .returning({ id: Files.id })
          .then(firstOrThrowWith(() => new Error('failed to insert file')));

        const media = await tx
          .insert(Media)
          .values({
            accountId,
            originalFileId: file.id,
            profileId,
            source: 'LOCAL',
          })
          .returning({ id: Media.id })
          .then(firstOrThrowWith(() => new Error('failed to insert media')));

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
    }
    catch {
      await cleanupUploadedObjects([key]);

      return c.json(jsonError('failed to persist image'), 500);
    }
  },
);
