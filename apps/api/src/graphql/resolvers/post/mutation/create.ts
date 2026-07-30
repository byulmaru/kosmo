import { PostVisibility } from '@kosmo/core/enums';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { MediaObject } from '../../media/ref';
import { Post } from '../ref';

const CreatePostMediaInput = builder.inputType('CreatePostMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    mediaId: t.globalID({ for: MediaObject }),
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
          media: z.array(z.unknown()).nullish(),
        })
        .passthrough()
        .refine(({ bodyText, media }) => bodyText.length > 0 || (media?.length ?? 0) > 0, {
          message: '본문 또는 이미지를 추가해주세요.',
          path: ['bodyText'],
        }),
    },
    input: {
      bodyText: t.input.string({ validate: postBodyTextOrEmptySchema }),
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

      const { post } = await createPost({
        accountId: ctx.session.accountId,
        document: postContentDocumentFromTextAndMedia(
          input.bodyText,
          media.map(({ mediaId }) => ({
            mediaId: mediaId.id,
          })),
          input.sensitiveMedia ?? false,
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

      return { post };
    },
  }),
);
