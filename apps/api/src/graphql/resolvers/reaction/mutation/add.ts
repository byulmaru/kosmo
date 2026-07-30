import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { NotFoundError } from '@kosmo/core/error';
import { addReaction } from '@kosmo/core/services';
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
        post: field.field({ type: Post }),
        reaction: field.field({ type: Reaction }),
      }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
      type: t.input.string({ validate: reactionTypeSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const post = await db
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

      const result = await addReaction({
        actorProfileId: ctx.session.profileId,
        origin: 'LOCAL',
        postId: post.id,
        type: input.type,
      });
      await result.postCommit();

      return { post: post.id, reaction: result.reaction };
    },
  }),
);
