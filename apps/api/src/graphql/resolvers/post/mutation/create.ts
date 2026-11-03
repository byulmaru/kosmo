import { db, firstOrThrow, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostVisibility } from '@kosmo/core/enums';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { submitLocalPost } from '../../post-request/mutation/submit';
import type { LocalPostSubmission } from '../../post-request/mutation/submit';
import { PostRequest } from '../../post-request/ref';
import { Profile } from '../../profile/ref';
import { Post } from '../ref';
import {
  CreatePostMediaInput,
  CreatePostMentionInput,
  localPostCreateInputSchema,
  localPostMediaArraySchema,
} from './prepare-local-input';
import type { PostAnalyticsPlatform } from '@kosmo/core/temporal/post-create';

const CreatePostPayload = builder.objectRef<LocalPostSubmission>('CreatePostPayload');

const getPostForSubmission = async ({
  postId,
  profileId,
}: LocalPostSubmission): Promise<typeof Posts.$inferSelect | null> => {
  if (!postId) {
    return null;
  }

  return db
    .select()
    .from(Posts)
    .where(and(eq(Posts.id, postId), eq(Posts.profileId, profileId)))
    .limit(1)
    .then(firstOrThrow);
};

CreatePostPayload.implement({
  fields: (t) => ({
    post: t.field({
      type: Post,
      nullable: true,
      resolve: (source) => getPostForSubmission(source),
    }),
    request: t.field({ type: PostRequest, nullable: true, resolve: ({ request }) => request }),
  }),
});

builder.mutationField('createPost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: CreatePostPayload,
    typeOptions: { validate: localPostCreateInputSchema },
    input: {
      bodyText: t.input.string({ validate: postBodyTextOrEmptySchema }),
      contentWarning: t.input.string({ required: false }),
      media: t.input.field({
        type: [CreatePostMediaInput],
        required: false,
        validate: localPostMediaArraySchema,
      }),
      mentions: t.input.field({
        type: [CreatePostMentionInput],
        required: false,
      }),
      actorProfileId: t.input.globalID({ for: Profile, required: false }),
      replyParentId: t.input.globalID({ for: Post, required: false }),
      repostSourceId: t.input.globalID({ for: Post, required: false }),
      sensitiveMedia: t.input.boolean({ required: false }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
      const headerPlatform = ctx.c?.req.header('x-kosmo-analytics-platform');
      const analyticsPlatform: PostAnalyticsPlatform | undefined =
        headerPlatform === 'web' || headerPlatform === 'native' ? headerPlatform : undefined;

      return await submitLocalPost(input, ctx, analyticsPlatform);
    },
  }),
);
