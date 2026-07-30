import { db, first, firstOrThrowWith, Media } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { getMediaStorageRepresentation } from '@/media-storage';
import { MediaObject } from '../ref';

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

      const representation = await getMediaStorageRepresentation(
        media.storageReference,
        ctx.c.req.raw.signal,
      );

      const completed = await db
        .update(Media)
        .set({
          originalMediaType: representation.mediaType,
          originalUrl: representation.url,
          readyAt: Temporal.Now.instant(),
          state: MediaState.READY,
        })
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
