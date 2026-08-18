import { deleteReaction } from '@kosmo/core/services';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Reaction } from '../ref';

type DeleteReactionPayload = {
  readonly post: string;
  readonly reactionId: string | null;
};

builder.mutationField('deleteReaction', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('DeleteReactionPayload', {
      fields: (field) => ({
        reactionId: field.globalID({
          nullable: true,
          resolve: (payload) => {
            const { reactionId } = payload as DeleteReactionPayload;
            return reactionId ? { id: reactionId, type: Reaction } : null;
          },
        }),
        post: field.field({
          nullable: true,
          type: Post,
        }),
      }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
      type: t.input.string({ validate: reactionTypeSchema }),
    },
    resolve: async (_, { input }, ctx): Promise<DeleteReactionPayload> => {
      const result = await deleteReaction({
        actorProfileId: ctx.session.profileId,
        origin: 'LOCAL',
        postId: input.postId.id,
        type: input.type,
      });

      return { post: result.postId, reactionId: result.reaction?.id ?? null };
    },
  }),
);
