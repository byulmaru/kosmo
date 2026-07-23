import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { NotFoundError } from '@kosmo/core/error';
import { addReactionWithStatus, createReactionNotification } from '@kosmo/core/services';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '../../post';
import { postAccessWhere } from '../../post/access';
import { Reaction } from '../ref';

builder.mutationField('addReaction', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('AddReactionPayload', {
      fields: (field) => ({
        reaction: field.field({ type: Reaction }),
      }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
      type: t.input.string({ validate: reactionTypeSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await db.transaction(async (tx) => {
        const post = await tx
          .select({ id: Posts.id })
          .from(Posts)
          .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(and(eq(Posts.id, input.postId.id), postAccessWhere({ ctx })))
          .limit(1)
          .then(first);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        return addReactionWithStatus(
          {
            actorProfileId: ctx.session.profileId,
            postId: post.id,
            type: input.type,
          },
          tx,
        );
      });

      if (result.created) {
        await createReactionNotification(result.reaction.id).catch(() => undefined);
      }

      return { reaction: result.reaction };
    },
  }),
);
