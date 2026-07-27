import { db, first, firstOrThrowWith, Media } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { MediaObject } from '../ref';

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

builder.mutationField('completeMediaUpload', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('CompleteMediaUploadPayload', {
      fields: (field) => ({
        media: field.field({ type: MediaObject }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: MediaObject }),
    },
    resolve: async (_, { input }, ctx) => {
      const media = await db
        .select()
        .from(Media)
        .where(
          and(
            eq(Media.id, input.id.id),
            eq(Media.accountId, ctx.session.accountId),
            eq(Media.source, MediaSource.LOCAL),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Media not found')));

      if (media.state === MediaState.READY) {
        return { media };
      }

      const mediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
      const mediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
      if (!mediaStorageOrigin || !mediaStorageApiKey) {
        throw new Error('Media Storage Service is not configured');
      }

      const completionPath = `/v1/uploads/${encodeURIComponent(media.storageReference)}`;
      const completionUrl = new URL(completionPath, mediaStorageOrigin);
      if (completionUrl.pathname !== completionPath) {
        throw new Error('Media Storage Service returned an unsafe upload reference');
      }

      const response = await globalThis.fetch(completionUrl, {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${mediaStorageApiKey}` },
        signal: AbortSignal.any([
          ctx.c.req.raw.signal,
          AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS),
        ]),
      });
      if (response.status === 404) {
        throw new Error('Media upload is not complete');
      }
      if (response.status !== 204) {
        throw new Error(`Media Storage Service rejected upload completion (${response.status})`);
      }

      const completed = await db
        .update(Media)
        .set({ readyAt: Temporal.Now.instant(), state: MediaState.READY })
        .where(
          and(
            eq(Media.id, media.id),
            eq(Media.accountId, ctx.session.accountId),
            eq(Media.source, MediaSource.LOCAL),
            eq(Media.state, MediaState.UPLOADING),
          ),
        )
        .returning()
        .then(first);
      if (completed) {
        return { media: completed };
      }

      return {
        media: await db
          .select()
          .from(Media)
          .where(
            and(
              eq(Media.id, media.id),
              eq(Media.accountId, ctx.session.accountId),
              eq(Media.source, MediaSource.LOCAL),
              eq(Media.state, MediaState.READY),
            ),
          )
          .limit(1)
          .then(firstOrThrowWith(() => new Error('Failed to complete Media upload'))),
      };
    },
  }),
);
