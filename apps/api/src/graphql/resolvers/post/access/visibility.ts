import { db, Instances, Posts, ProfileFollows, Profiles } from '@kosmo/core/db';
import { postVisibilityCondition } from '@kosmo/core/post-visibility';
import { and, eq, exists, sql } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { Database } from '@kosmo/core/db';
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
  viewerProfileId,
  db: database,
}: {
  columns: PostVisibilityAccessColumns;
  viewerProfileId?: SQLWrapper | string | null;
  db: Database;
}): SQL<boolean> => {
  const viewerFollowsAuthor = viewerProfileId
    ? and(
        exists(
          database
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

  // TODO(PROD-121): Extend this helper with DIRECT access once recipient policy exists.
  return postVisibilityCondition({
    columns: {
      authorProfileId: columns.postProfileId,
      authorVisible: columns.profileVisible,
      postState: columns.postState,
      postVisibility: columns.postVisibility,
    },
    viewerFollowsAuthor,
    viewerProfileId,
  });
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
    viewerProfileId: ctx.session?.profileId,
    db,
  });
