import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PostVisibility } from '@kosmo/core/enums';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Media } from '../../media/ref';
import { postAccessWhere } from '../access';
import { homePostListCandidateWhere, profilePostListCandidateWhere } from '../list-policy';
import { Post, PostConnectionEdge } from '../ref';

const CreatePostMediaInput = builder.inputType('CreatePostMediaInput', {
  fields: (t) => ({
    altText: t.string({ required: false }),
    mediaId: t.globalID({ for: Media }),
  }),
});

const postListEdge = async ({
  candidateWhere,
  ctx,
  post,
}: {
  candidateWhere: ReturnType<typeof and>;
  ctx: Parameters<typeof postAccessWhere>[0]['ctx'];
  post: typeof Posts.$inferSelect;
}) => {
  const candidate = await db
    .select({ id: Posts.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(eq(Posts.id, post.id), candidateWhere, postAccessWhere({ ctx })))
    .limit(1)
    .then(first);

  return candidate ? { cursor: candidate.id, node: post } : null;
};

builder.mutationField('createPost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('CreatePostPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
        homeTimelineEdge: field.field({ type: PostConnectionEdge, nullable: true }),
        profilePostsEdge: field.field({ type: PostConnectionEdge, nullable: true }),
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

      const [homeTimelineEdge, profilePostsEdge] = await Promise.all([
        postListEdge({
          candidateWhere: homePostListCandidateWhere(ctx.session.profileId),
          ctx,
          post,
        }),
        postListEdge({
          candidateWhere: profilePostListCandidateWhere(ctx.session.profileId),
          ctx,
          post,
        }),
      ]);

      return { homeTimelineEdge, post, profilePostsEdge };
    },
  }),
);
