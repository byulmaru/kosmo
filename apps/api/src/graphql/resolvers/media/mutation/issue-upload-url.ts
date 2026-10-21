import { db, firstOrThrowWith, Media as MediaTable } from '@kosmo/core/db';
import { AccountProfileRole, MediaSource, MediaState } from '@kosmo/core/enums';
import { issueNexusMediaUploadPutUrl } from '@kosmo/core/media-upload';
import { MEDIA_UPLOAD_MAX_BYTES } from '@kosmo/core/temporal/media-upload';
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
      size: t.input.int({
        required: false,
        validate: z.number().int().min(1).max(MEDIA_UPLOAD_MAX_BYTES).nullish(),
      }),
    },
    resolve: async (_, { input }, ctx) => {
      const composerProfileId = await resolveComposerProfileId(ctx, input?.actorProfileId?.id);
      const upload =
        input?.size == null
          ? await issueMediaStorageUpload(ctx.c.req.raw.signal)
          : await issueNexusMediaUploadPutUrl(input.size);

      const media = await db
        .insert(MediaTable)
        .values({
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
          accountId: ctx.session.accountId,
          profileId: composerProfileId,
          storageReference: upload.storageReference,
          uploadExpiresAt: upload.expiresAt,
        })
        .returning()
        .then(firstOrThrowWith(() => new Error('Failed to create Uploading Media')));

      return {
        media,
        uploadUrl: upload.uploadUrl,
        expiresAt: upload.expiresAt,
      };
    },
  }),
);

const issueMediaStorageUpload = async (requestSignal: AbortSignal) => {
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
    signal: AbortSignal.any([requestSignal, AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS)]),
  });
  if (response.status !== 201) {
    throw new Error(`Media Storage Service rejected upload issuance (${response.status})`);
  }

  const upload = uploadResponseSchema.safeParse(await response.json());
  if (!upload.success) {
    throw new Error('Media Storage Service returned an invalid upload response');
  }

  return {
    storageReference: upload.data.id,
    uploadUrl: upload.data.uploadUrl,
    expiresAt: Temporal.Instant.from(upload.data.expiresAt),
  };
};
