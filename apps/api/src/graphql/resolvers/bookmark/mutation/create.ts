import { AccountProfiles, Accounts, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { AccountState, InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { createBookmark } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { postAccessWhere } from '@/graphql/resolvers/post/access';
import { Bookmark } from '../ref';

builder.mutationField('createBookmark', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
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
        const actor = await tx
          .select({ id: Profiles.id })
          .from(Profiles)
          .innerJoin(
            AccountProfiles,
            and(
              eq(AccountProfiles.profileId, Profiles.id),
              eq(AccountProfiles.accountId, ctx.session.accountId),
            ),
          )
          .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(Profiles.id, ctx.session.profileId),
              eq(Profiles.state, ProfileState.ACTIVE),
              eq(Accounts.state, AccountState.ACTIVE),
              eq(Instances.kind, InstanceKind.LOCAL),
              eq(Instances.state, InstanceState.ACTIVE),
            ),
          )
          .limit(1)
          .then(first);
        if (!actor) {
          throw new PermissionDeniedError();
        }

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

        return {
          bookmark: await createBookmark({ postId: post.id, profileId: actor.id }, tx),
        };
      }),
  }),
);
