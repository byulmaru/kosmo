import { db, firstOrThrow, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostVisibility } from '@kosmo/core/enums';
import { PostRequestStatus } from '@kosmo/core/temporal/post-request';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { submitPostRequest } from '../../post-request/mutation/submit';
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
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

type CreatePostPayloadSource = {
  readonly request: PostRequestState;
};

const CreatePostPayload = builder.objectRef<CreatePostPayloadSource>('CreatePostPayload');

const getPostForRequest = async (
  request: PostRequestState,
): Promise<typeof Posts.$inferSelect | null> => {
  if (request.status !== PostRequestStatus.PUBLISHED) {
    return null;
  }

  const postId = request.result?.postId;
  if (!postId) {
    throw new Error('Published Post request has no Post ID');
  }

  return db
    .select()
    .from(Posts)
    .where(and(eq(Posts.id, postId), eq(Posts.profileId, request.snapshot.input.profileId)))
    .limit(1)
    .then(firstOrThrow);
};

CreatePostPayload.implement({
  fields: (t) => ({
    post: t.field({
      type: Post,
      nullable: true,
      resolve: ({ request }) => getPostForRequest(request),
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

      const request = await submitPostRequest(input, ctx, analyticsPlatform);
      return { request };
    },
  }),
);
