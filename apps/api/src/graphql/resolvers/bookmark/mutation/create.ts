import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { createBookmark } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { directPostAccessWhere } from '@/graphql/resolvers/post/access';
import { Bookmark } from '../ref';

builder.mutationField('createBookmark', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CreateBookmarkPayload', {
      fields: (field) => ({
        bookmark: field.field({ type: Bookmark }),
      }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) =>
      db.transaction(async (tx) => {
        const post = await tx
          .select({ id: Posts.id })
          .from(Posts)
          .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(Posts.id, input.postId.id),
              directPostAccessWhere({ ctx, profileMute: 'ignore' }),
            ),
          )
          .limit(1)
          .then(first);
        if (!post) {
          throw new NotFoundError('Post not found');
        }

        return {
          bookmark: await createBookmark(
            { postId: post.id, profileId: ctx.session.profile.id },
            tx,
          ),
        };
      }),
  }),
);
