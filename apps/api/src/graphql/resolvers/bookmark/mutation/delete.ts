import { AccountProfiles, Accounts, db, first, Instances, Profiles } from '@kosmo/core/db';
import { AccountState, InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { deleteBookmark } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Bookmark } from '../ref';

type DeleteBookmarkPayload = {
  readonly bookmarkId: string | null;
  readonly post: string | null;
};

builder.mutationField('deleteBookmark', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('DeleteBookmarkPayload', {
      fields: (field) => ({
        bookmarkId: field.globalID({
          nullable: true,
          resolve: (payload) => {
            const { bookmarkId } = payload as DeleteBookmarkPayload;
            return bookmarkId ? { id: bookmarkId, type: Bookmark } : null;
          },
        }),
        post: field.field({
          nullable: true,
          type: Post,
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Bookmark }),
    },
    resolve: async (_, { input }, ctx) =>
      db.transaction(async (tx): Promise<DeleteBookmarkPayload> => {
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

        const deleted = await deleteBookmark({ bookmarkId: input.id.id, profileId: actor.id }, tx);

        return {
          bookmarkId: deleted?.id ?? null,
          post: deleted?.postId ?? null,
        };
      }),
  }),
);
