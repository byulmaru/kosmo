import { db, firstOrThrowWith, Media as MediaTable } from '@kosmo/core/db';
import { AccountProfileRole, MediaSource, MediaState } from '@kosmo/core/enums';
import { issueNexusMediaUploadPutUrl } from '@kosmo/core/media-upload';
import { builder } from '@/graphql/builder';
import { resolveComposerProfileId } from '@/profile/authorization';
import { Profile } from '../../profile/ref';
import { Media } from '../ref';

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
      const upload = await issueNexusMediaUploadPutUrl();

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
