import { db } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { deleteNotificationBySource, removeReaction } from '@kosmo/core/services';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Reaction } from '../ref';
import { deliverReactionUndo, resolveReactionDeliveryCommand } from './activitypub-delivery';

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
      const { command, removed } = await db.transaction(async (tx) => {
        const removed = await removeReaction(
          {
            actorProfileId: ctx.session.profileId,
            postId: input.postId.id,
            type: input.type,
          },
          tx,
        );
        const command = removed.reaction
          ? await resolveReactionDeliveryCommand(tx, removed.reaction)
          : undefined;

        return { command, removed };
      });

      if (removed.reaction) {
        try {
          await deleteNotificationBySource(NotificationKind.REACTION, removed.reaction.id);
        } catch (error) {
          console.error('Failed to clean up Reaction Notification', {
            error,
            reactionId: removed.reaction.id,
          });
        }
      }
      await deliverReactionUndo(command);

      return { post: removed.postId, reactionId: removed.reaction?.id ?? null };
    },
  }),
);
