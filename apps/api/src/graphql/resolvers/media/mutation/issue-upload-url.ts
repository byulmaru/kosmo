import { db, firstOrThrowWith, Media } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { MediaObject } from '../ref';

const uploadResponseSchema = z.object({
  id: z.string().min(1),
  uploadUrl: z.httpUrl(),
  expiresAt: z.string(),
});

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

builder.mutationField('issueMediaUploadUrl', (t) =>
  t.withAuth({ usingProfile: true }).field({
    type: builder.simpleObject('IssueMediaUploadUrlPayload', {
      fields: (field) => ({
        media: field.field({ type: MediaObject }),
        uploadUrl: field.string(),
        expiresAt: field.field({ type: 'DateTime' }),
      }),
    }),
    resolve: async (_, __, ctx) => {
      const mediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
      const mediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
      if (!mediaStorageOrigin || !mediaStorageApiKey) {
        throw new Error('Media Storage Service is not configured');
      }

      const response = await globalThis.fetch(new URL('/v1/uploads', mediaStorageOrigin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mediaStorageApiKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.any([
          ctx.c.req.raw.signal,
          AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS),
        ]),
      });
      if (response.status !== 201) {
        throw new Error(`Media Storage Service rejected upload issuance (${response.status})`);
      }

      const upload = uploadResponseSchema.safeParse(await response.json());
      if (!upload.success) {
        throw new Error('Media Storage Service returned an invalid upload response');
      }
      const expiresAt = Temporal.Instant.from(upload.data.expiresAt);

      const media = await db
        .insert(Media)
        .values({
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
          accountId: ctx.session.accountId,
          profileId: ctx.session.profileId,
          storageReference: upload.data.id,
          uploadExpiresAt: expiresAt,
        })
        .returning()
        .then(firstOrThrowWith(() => new Error('Failed to create Uploading Media')));

      return {
        media,
        uploadUrl: upload.data.uploadUrl,
        expiresAt,
      };
    },
  }),
);
