import { zValidator } from '@hono/zod-validator';
import { createDbId, db, Files, TableCode } from '@kosmo/db';
import { FileOwnership, FileState } from '@kosmo/enum';
import { env } from '@kosmo/env';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import type { Env } from '@/context';

export const upload = new Hono<Env>();

const MAX_ORIGINAL_FILE_SIZE = 32 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/tiff'];

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

    const now = Temporal.Now.zonedDateTimeISO('UTC');

    const { file } = c.req.valid('form');
    const fileId = createDbId(TableCode.Files);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${env.MEDIA_API_URL}/files`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      return c.json({ code: 'error.upload.failed' }, 500);
    }

    const result = await response.json() as { key: string; url: string; placeholder: string; size: number };

    await db.insert(Files).values({
      id: fileId,
      accountId: c.var.context.session.accountId,
      profileId: c.var.context.session.profileId,
      ownership: FileOwnership.LOCAL,
      state: FileState.EPHEMERAL,
      path: result.url,
      placeholder: result.placeholder,
      size: result.size,
      expiresAt: now.toInstant().add({ hours: 24 }),
    });

    return c.json({
      fileId,
    });
  },
);
