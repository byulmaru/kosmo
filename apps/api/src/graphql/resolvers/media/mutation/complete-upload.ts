import { first, firstOrThrowWith, Media as MediaTable } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Media } from '../ref';

const representationResponseSchema = z.object({
  mediaType: z.string().min(1),
  url: z.httpUrl(),
});

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

builder.mutationField('completeMediaUpload', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('CompleteMediaUploadPayload', {
      fields: (field) => ({
        media: field.field({ type: Media }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Media }),
    },
    resolve: async (_, { input }, ctx) => {
      const media = await ctx.db
        .select()
        .from(MediaTable)
        .where(
          and(
            eq(MediaTable.id, input.id.id),
            eq(MediaTable.accountId, ctx.session.accountId),
            eq(MediaTable.source, MediaSource.LOCAL),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Media not found')));

      if (media.state === MediaState.READY) {
        return { media };
      }
      if (media.storageReference === null) {
        throw new Error('Uploading Local Media is missing its storage reference');
      }

      const mediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
      const mediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
      if (!mediaStorageOrigin || !mediaStorageApiKey) {
        throw new Error('Media Storage Service is not configured');
      }

      const representationPath = `/v1/uploads/${encodeURIComponent(media.storageReference)}`;
      const representationUrl = new URL(representationPath, mediaStorageOrigin);
      if (representationUrl.pathname !== representationPath) {
        throw new Error('Media Storage Service returned an unsafe upload reference');
      }

      const response = await globalThis.fetch(representationUrl, {
        headers: { Authorization: `Bearer ${mediaStorageApiKey}` },
        signal: AbortSignal.any([
          ctx.c.req.raw.signal,
          AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS),
        ]),
      });
      if (response.status === 404) {
        throw new Error('Media upload is not complete');
      }
      if (response.status !== 200) {
        throw new Error(
          `Media Storage Service rejected representation lookup (${response.status})`,
        );
      }
      const representation = representationResponseSchema.safeParse(await response.json());
      if (!representation.success) {
        throw new Error('Media Storage Service returned an invalid representation');
      }

      const completed = await ctx.db
        .update(MediaTable)
        .set({
          mediaType: representation.data.mediaType,
          url: representation.data.url,
          readyAt: Temporal.Now.instant(),
          state: MediaState.READY,
        })
        .where(
          and(
            eq(MediaTable.id, media.id),
            eq(MediaTable.accountId, ctx.session.accountId),
            eq(MediaTable.source, MediaSource.LOCAL),
            eq(MediaTable.state, MediaState.UPLOADING),
          ),
        )
        .returning()
        .then(first);
      if (completed) {
        return { media: completed };
      }

      return {
        media: await ctx.db
          .select()
          .from(MediaTable)
          .where(
            and(
              eq(MediaTable.id, media.id),
              eq(MediaTable.accountId, ctx.session.accountId),
              eq(MediaTable.source, MediaSource.LOCAL),
              eq(MediaTable.state, MediaState.READY),
            ),
          )
          .limit(1)
          .then(firstOrThrowWith(() => new Error('Failed to complete Media upload'))),
      };
    },
  }),
);
