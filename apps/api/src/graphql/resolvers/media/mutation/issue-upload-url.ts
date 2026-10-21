import '@kosmo/core/polyfill';

import { db, firstOrThrowWith, Media as MediaTable } from '@kosmo/core/db';
import { AccountProfileRole, MediaSource, MediaState } from '@kosmo/core/enums';
import { parseNexusMediaUploadReference } from '@kosmo/core/media-upload';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { resolveComposerProfileId } from '@/profile/authorization';
import { Profile } from '../../profile/ref';
import { Media } from '../ref';

const uploadResponseSchema = z.object({
  id: z.string().min(1),
  uploadUrl: z.httpUrl(),
  expiresAt: z.string(),
});

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

builder.mutationField('issueMediaUploadUrl', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('IssueMediaUploadUrlPayload', {
      fields: (field) => ({
        media: field.field({ type: Media }),
        uploadUrl: field.string(),
        expiresAt: field.field({ type: 'DateTime' }),
      }),
    }),
    argOptions: {
      required: false,
    },
    input: {
      actorProfileId: t.input.globalID({ for: Profile, required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const composerProfileId = await resolveComposerProfileId(ctx, input?.actorProfileId?.id);
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
        body: JSON.stringify({ staging: true }),
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

      const storageReference = `nexus:v1:${upload.data.id.slice(2)}`;
      if (parseNexusMediaUploadReference(storageReference)?.id !== upload.data.id) {
        throw new Error('Media Storage Service returned an invalid upload response');
      }
      const expiresAt = Temporal.Instant.from(upload.data.expiresAt);

      const media = await db
        .insert(MediaTable)
        .values({
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
          accountId: ctx.session.accountId,
          profileId: composerProfileId,
          storageReference,
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
