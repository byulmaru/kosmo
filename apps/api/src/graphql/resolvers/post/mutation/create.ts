import { randomUUID } from 'node:crypto';
import { db, firstOrThrow, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostQuotePolicy, PostVisibility } from '@kosmo/core/enums';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { postCreateWorkflow, unwrapPostTransition } from '@kosmo/core/temporal/post';
import { postBodyMaxLength, postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { resolveComposerProfileId } from '@/profile/authorization';
import { Media } from '../../media/ref';
import { Profile } from '../../profile/ref';
import { Post } from '../ref';

const CreatePostMediaInput = builder.inputType('CreatePostMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    mediaId: t.globalID({ for: Media }),
  }),
});

builder.mutationField('createPost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CreatePostPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
      }),
    }),
    typeOptions: {
      validate: z
        .object({
          bodyText: z.string(),
          contentWarning: z.string().nullish(),
          media: z.array(z.unknown()).nullish(),
        })
        .passthrough()
        .refine(({ bodyText, media }) => bodyText.length > 0 || (media?.length ?? 0) > 0, {
          message: '본문 또는 이미지를 추가해주세요.',
          path: ['bodyText'],
        })
        .refine(
          ({ bodyText, contentWarning }) =>
            normalizePostContentPlainText(bodyText).length +
              normalizePostContentPlainText(contentWarning ?? '').length <=
            postBodyMaxLength,
          {
            message:
              '본문과 내용 경고는 ' +
              postBodyMaxLength.toLocaleString('ko-KR') +
              '자까지 작성할 수 있어요.',
            path: ['contentWarning'],
          },
        ),
    },
    input: {
      bodyText: t.input.string({ validate: postBodyTextOrEmptySchema }),
      contentWarning: t.input.string({ required: false }),
      media: t.input.field({
        type: [CreatePostMediaInput],
        required: false,
        validate: z.array(z.unknown()).max(4, { message: '이미지는 4개까지 첨부할 수 있어요.' }),
      }),
      actorProfileId: t.input.globalID({ for: Profile, required: false }),
      replyParentId: t.input.globalID({ for: Post, required: false }),
      repostSourceId: t.input.globalID({ for: Post, required: false }),
      quotePolicy: t.input.field({ type: PostQuotePolicy, required: false }),
      sensitiveMedia: t.input.boolean({ required: false }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
      const media = input.media ?? [];
      const contentWarning = normalizePostContentPlainText(input.contentWarning ?? '');
      const profileId = await resolveComposerProfileId(ctx, input.actorProfileId?.id);

      const result = unwrapPostTransition(
        await runWorkflow(postCreateWorkflow, {
          args: [
            {
              admissionId: randomUUID(),
              accountId: ctx.session.accountId,
              document: postContentDocumentFromTextAndMedia(
                input.bodyText,
                media.map(({ mediaId }) => ({
                  mediaId: mediaId.id,
                })),
                input.sensitiveMedia ?? false,
                contentWarning || null,
              ),
              media: media.map(({ altText, mediaId }) => ({
                altText: altText ?? null,
                mediaId: mediaId.id,
              })),
              origin: 'LOCAL',
              profileId,
              replyParentId: input.replyParentId?.id,
              repostSourceId: input.repostSourceId?.id,
              quotePolicy: input.quotePolicy ?? undefined,
              visibility: input.visibility,
            },
          ],
          mode: 'update-with-start',
          updateId: 'create',
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      );

      const post = await db
        .select()
        .from(Posts)
        .where(eq(Posts.id, result.postId))
        .then(firstOrThrow);
      return { post };
    },
  }),
);
