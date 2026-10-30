import { db, firstOrThrow, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostVisibility } from '@kosmo/core/enums';
import { ConflictError, KosmoError } from '@kosmo/core/error';
import { runWorkflow, temporalClient } from '@kosmo/core/temporal/client';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import { PostRequestStatus, postRequestWorkflowId } from '@kosmo/core/temporal/post-request';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { submitPostRequest } from '../../post-request/mutation/submit';
import { PostRequest } from '../../post-request/ref';
import { Profile } from '../../profile/ref';
import { Post } from '../ref';
import { rethrowPostWorkflowFailure } from './errors';
import {
  CreatePostMediaInput,
  CreatePostMentionInput,
  localPostCreateInputSchema,
  localPostMediaArraySchema,
  prepareLocalPostInput,
} from './prepare-local-input';
import type { PostCreateWorkflowArgs } from '@kosmo/core/temporal/post-create';
import type { PostRequestState, PostRequestWorkflowArgs } from '@kosmo/core/temporal/post-request';

type PostRequestWorkflow = (args: PostRequestWorkflowArgs) => Promise<PostRequestState>;

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
  const state = await temporalClient
    .withDeadline(Date.now() + 30_000, () =>
      temporalClient.workflow
        .getHandle<PostRequestWorkflow>(
          postRequestWorkflowId(accountId, request.snapshot.requestId),
        )
        .result(),
    )
    .catch(rethrowPostWorkflowFailure);

  if (state.status === PostRequestStatus.PUBLISHED) {
    if (!state.result?.postId) {
      throw new Error('Published Post request has no Post ID');
    }

    return db
      .select()
      .from(Posts)
      .where(
        and(
          eq(Posts.id, state.result.postId),
          eq(Posts.profileId, request.snapshot.input.profileId),
        ),
      )
      .limit(1)
      .then(firstOrThrow);
  }

  if (state.status === PostRequestStatus.FAILED) {
    if (state.error && state.error.code !== 'INTERNAL_SERVER_ERROR') {
      throw new KosmoError({ code: state.error.code, message: state.error.message });
    }
    throw new Error(state.error?.message ?? 'Post request failed');
  }

  if (state.status === PostRequestStatus.CANCELLED) {
    throw new ConflictError({ message: 'Post request is already finished' });
  }

  throw new Error(`Post request completed with unexpected status: ${state.status}`);
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
      if (input.requestId) {
        const request = await submitPostRequest(input, input.requestId, ctx);
        return {
          post: () => getPostForRequest(ctx.session.accountId, request),
          request,
        };
      }

      const localInput = await prepareLocalPostInput(input, ctx);
      const args: PostCreateWorkflowArgs = {
        requestId: crypto.randomUUID(),
        input: localInput,
      };
      const result = await runWorkflow(postCreateWorkflow, {
        args: [args],
        mode: 'execute',
        returnExistingResult: true,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      }).catch(rethrowPostWorkflowFailure);
      if (result.status === 'rejected') {
        throw new Error('Local Post creation returned an ActivityPub-only rejection');
      }

      const post = await db
        .select()
        .from(Posts)
        .where(and(eq(Posts.id, result.postId), eq(Posts.profileId, localInput.profileId)))
        .limit(1)
        .then(firstOrThrow);

      return { post: async () => post, request: null };
    },
  }),
);
