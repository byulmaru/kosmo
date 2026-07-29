import { PostVisibility } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
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
    input: {
      bodyText: t.input.string(),
      media: t.input.field({ type: [CreatePostMediaInput], required: false }),
      replyParentId: t.input.globalID({ for: Post, required: false }),
      sensitiveMedia: t.input.boolean({ required: false }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
      const bodyText = normalizePostContentPlainText(input.bodyText);
      const media = input.media ?? [];
      if (bodyText.length > postBodyMaxLength) {
        throw new ValidationError(
          `본문은 ${postBodyMaxLength.toLocaleString('ko-KR')}자까지 작성할 수 있어요.`,
          { field: 'bodyText' },
        );
      }
      if (media.length > 4) {
        throw new ValidationError('이미지는 4개까지 첨부할 수 있어요.', { field: 'media' });
      }
      if (bodyText.length === 0 && media.length === 0) {
        throw new ValidationError('본문 또는 이미지를 추가해주세요.', { field: 'bodyText' });
      }

      const { post } = await createPost({
        accountId: ctx.session.accountId,
        document: postContentDocumentFromTextAndMedia(
          bodyText,
          media.map(({ altText, mediaId }) => ({
            altText: altText ?? null,
            mediaId: mediaId.id,
          })),
          input.sensitiveMedia ?? false,
        ),
        origin: 'LOCAL',
        profileId: ctx.session.profileId,
        replyParentId: input.replyParentId?.id,
        visibility: input.visibility,
      });

      return { post };
    },
  }),
);
