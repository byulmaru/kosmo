import { Bookmarks, db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postAccessWhere } from '@/graphql/resolvers/post/access';
import { Profile } from '@/graphql/resolvers/profile';
import { Bookmark, BookmarkConnection } from '../ref';
import type { BookmarkRow } from '../ref';

builder.objectField(Profile, 'bookmarks', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: Bookmark,
      resolve: (profile, args, ctx) => {
        if (profile.id !== ctx.session.profileId) {
          throw new PermissionDeniedError('Bookmark owner is required');
        }

        return resolveCursorConnection<Promise<BookmarkRow[]>>(
          {
            args,
            toCursor: (bookmark) => bookmark.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Bookmarks))
              .from(Bookmarks)
              .innerJoin(Posts, eq(Posts.id, Bookmarks.postId))
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Bookmarks.profileId, profile.id),
                  postAccessWhere({ ctx }),
                  before ? gt(Bookmarks.id, before) : undefined,
                  after ? lt(Bookmarks.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Bookmarks.id) : desc(Bookmarks.id))
              .limit(limit),
        );
      },
    },
    BookmarkConnection as never,
  ),
);
