import { deleteReaction } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Reaction } from '../ref';

builder.mutationField('deleteReaction', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('DeleteReactionPayload', {
      fields: (field) => ({
        reactionId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { reactionId: string }).reactionId,
            type: Reaction,
          }),
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Reaction }),
    },
    resolve: (_, { input }, ctx) =>
      deleteReaction({
        actorProfileId: ctx.session.profileId,
        reactionId: input.id.id,
      }),
  }),
);
