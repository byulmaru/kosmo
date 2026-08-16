import { PostVisibility } from '@kosmo/core/enums';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyMaxLength, postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Media } from '../../media/ref';
import { Post } from '../ref';

const CreatePostMediaInput = builder.inputType('CreatePostMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    mediaId: t.globalID({ for: Media }),
  }),
});

builder.mutationField('createPost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
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
      replyParentId: t.input.globalID({ for: Post, required: false }),
      sensitiveMedia: t.input.boolean({ required: false }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
      const media = input.media ?? [];
      const contentWarning = normalizePostContentPlainText(input.contentWarning ?? '');

      const result = await createPost({
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
        profileId: ctx.session.profileId,
        replyParentId: input.replyParentId?.id,
        visibility: input.visibility,
      });

      return { post: result.post };
    },
  }),
);
