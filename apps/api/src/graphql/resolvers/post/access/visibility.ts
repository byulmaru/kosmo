import { db, Instances, Posts, ProfileFollows, Profiles } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type PostVisibilityAccessColumns = {
  postProfileId: SQLWrapper;
  postState: SQLWrapper;
  postVisibility: SQLWrapper;
  profileVisible: SQL<boolean>;
};

export const postVisibilityAccessCondition = ({
  columns,
  ctx,
}: {
  columns: PostVisibilityAccessColumns;
  ctx: UserContext;
}): SQL<boolean> => {
  const publicWhere = inArray(columns.postVisibility, [
    PostVisibility.PUBLIC,
    PostVisibility.UNLISTED,
  ]);
  const viewerProfileId = ctx.session?.profileId;
  const followerWhere = viewerProfileId
    ? and(
        eq(columns.postVisibility, PostVisibility.FOLLOWERS),
        exists(
          db
            .select({ id: ProfileFollows.id })
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.followerProfileId, viewerProfileId),
                eq(ProfileFollows.followeeProfileId, columns.postProfileId),
              ),
            ),
        ),
      )
    : undefined;
  const visibleWhere = viewerProfileId
    ? or(publicWhere, eq(columns.postProfileId, viewerProfileId), followerWhere)!
    : publicWhere;

  // TODO(PROD-121): Extend this helper with DIRECT access once recipient policy exists.
  return sql<boolean>`${and(
    eq(columns.postState, PostState.ACTIVE),
    columns.profileVisible,
    visibleWhere,
  )!}`;
};

export const postVisibilityAccessWhere = ({ ctx }: { ctx: UserContext }) =>
  postVisibilityAccessCondition({
    columns: {
      postProfileId: Posts.profileId,
      postState: Posts.state,
      postVisibility: Posts.visibility,
      profileVisible: sql<boolean>`${visibleProfileWhere({
        profile: Profiles,
        instance: Instances,
      })}`,
    },
    ctx,
  });
