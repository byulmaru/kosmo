import { db, firstOrThrow, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostVisibility } from '@kosmo/core/enums';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import { postBodyTextOrEmptySchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
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

builder.mutationField('createPost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CreatePostPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
      }),
    }),
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

      return { post };
    },
  }),
);
