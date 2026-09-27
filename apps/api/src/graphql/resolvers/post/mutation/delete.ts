import { AccountProfileRole } from '@kosmo/core/enums';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { postDeleteMutationWorkflow, unwrapPostTransition } from '@kosmo/core/temporal/post';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.mutationField('deletePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('DeletePostPayload', {
      fields: (field) => ({
        postId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { postId: string }).postId,
            type: Post,
          }),
        }),
        repostSource: field.field({
          nullable: true,
          type: Post,
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = unwrapPostTransition(
        await runWorkflow(postDeleteMutationWorkflow, {
          args: [
            {
              actorProfileId: ctx.session.profile.id,
              origin: 'LOCAL',
              postId: input.id.id,
            },
          ],
          mode: 'update-with-start',
          updateId: 'delete',
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        }),
      );

      return {
        postId: result.postId,
        repostSource: result.sourcePostId,
      };
    },
  }),
);
