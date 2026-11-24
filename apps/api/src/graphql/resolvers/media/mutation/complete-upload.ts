import { db, first, firstOrThrowWith, Media as MediaTable } from '@kosmo/core/db';
import { AccountProfileRole, MediaSource, MediaState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { isNexusMediaUpload } from '@kosmo/core/media-upload';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Media } from '../ref';

builder.mutationField('completeMediaUpload', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CompleteMediaUploadPayload', {
      fields: (field) => ({
        media: field.field({ type: Media }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Media }),
      applyAiProhibitFilter: t.input.boolean({ required: false, defaultValue: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const media = await db
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
      if (!isNexusMediaUpload(media.storageReference)) {
        throw new ConflictError({ message: '이미지를 다시 첨부해 주세요' });
      }

      const findReadyMedia = () =>
        db
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
          .then(first);

      try {
        await runWorkflow(mediaUploadWorkflow, {
          args: [
            {
              mediaId: media.id,
              accountId: ctx.session.accountId,
              applyNightshade: input.applyAiProhibitFilter ?? false,
            },
          ],
          mode: 'execute',
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        });
      } catch (error) {
        const readyMedia = await findReadyMedia().catch(() => undefined);
        if (readyMedia) {
          return { media: readyMedia };
        }
        throw error;
      }

      const readyMedia = await findReadyMedia();
      if (!readyMedia) {
        throw new Error('Failed to complete Media upload');
      }
      return { media: readyMedia };
    },
  }),
);
