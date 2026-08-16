import { db } from '@kosmo/core/db';
import { deleteBookmark } from '@kosmo/core/services';
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
    resolve: async (_, { input }, ctx): Promise<DeleteBookmarkPayload> => {
      const deleted = await deleteBookmark(
        {
          bookmarkId: input.id.id,
          profileId: ctx.session.profileId,
        },
        db,
      );

      return {
        bookmarkId: deleted?.id ?? null,
        post: deleted?.postId ?? null,
      };
    },
  }),
);
