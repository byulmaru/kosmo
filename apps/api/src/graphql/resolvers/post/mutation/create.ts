import { db, firstOrThrow, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostVisibility } from '@kosmo/core/enums';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { submitPostRequest, waitForPostRequestResult } from '../../post-request/mutation/submit';
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
  readonly post: () => Promise<typeof Posts.$inferSelect>;
  readonly request: PostRequestState | null;
};

const CreatePostPayload = builder.objectRef<CreatePostPayloadSource>('CreatePostPayload');

CreatePostPayload.implement({
  fields: (t) => ({
    post: t.field({ type: Post, resolve: ({ post }) => post() }),
    request: t.field({ type: PostRequest, nullable: true, resolve: ({ request }) => request }),
  }),
});

const getPostForRequest = async (
  accountId: string,
  request: PostRequestState,
): Promise<typeof Posts.$inferSelect> => {
  const state = await waitForPostRequestResult(accountId, request);

  return db
    .select()
    .from(Posts)
    .where(
      and(
        eq(Posts.id, state.result!.postId),
        eq(Posts.profileId, request.snapshot.input.profileId),
      ),
    )
    .limit(1)
    .then(firstOrThrow);
};

builder.mutationField('createPost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: CreatePostPayload,
    typeOptions: { validate: localPostCreateInputSchema },
    input: {
      requestId: t.input.string({ required: false, validate: z.uuid().nullish() }),
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

      const request = await submitPostRequest(
        input,
        input.requestId ?? crypto.randomUUID(),
        ctx,
        analyticsPlatform,
      );
      return {
        post: () => getPostForRequest(ctx.session.accountId, request),
        request,
      };
    },
  }),
);
