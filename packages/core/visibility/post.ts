import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { ProfileFollows } from '../db';
import { PostState, PostVisibility } from '../enums';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { DatabaseHandle } from '../db';

type PostVisibilityConditionColumns = {
  readonly authorProfileId: SQLWrapper;
  readonly authorVisible: SQLWrapper;
  readonly postState: SQLWrapper;
  readonly postVisibility: SQLWrapper;
};

export const postVisibilityCondition = ({
  columns,
  viewerFollowsAuthor,
  viewerProfileId,
}: {
  readonly columns: PostVisibilityConditionColumns;
  readonly viewerFollowsAuthor?: SQLWrapper;
  readonly viewerProfileId?: SQLWrapper | string | null;
}): SQL<boolean> => {
  const publicWhere = inArray(columns.postVisibility, [
    PostVisibility.PUBLIC,
    PostVisibility.UNLISTED,
  ]);
  const visibleWhere = viewerProfileId
    ? or(
        publicWhere,
        eq(columns.authorProfileId, viewerProfileId),
        viewerFollowsAuthor
          ? and(eq(columns.postVisibility, PostVisibility.FOLLOWERS), viewerFollowsAuthor)
          : undefined,
      )
    : publicWhere;

  return sql<boolean>`${and(
    eq(columns.postState, PostState.ACTIVE),
    columns.authorVisible,
    visibleWhere,
  )!}`;
};

type VisiblePost = {
  readonly profileId: SQLWrapper;
  readonly state: SQLWrapper;
  readonly visibility: SQLWrapper;
};

/**
 * Applies the canonical post visibility condition for a profile viewer.
 *
 * The helper lives in core so API reads and background cleanup can share the
 * same post state/visibility semantics without importing API resolver code.
 */
export const visiblePostWhere = ({
  post,
  profileVisible,
  viewerProfileId,
  db,
}: {
  readonly post: VisiblePost;
  readonly profileVisible: SQL<boolean>;
  readonly viewerProfileId?: SQLWrapper | string | null;
  readonly db: DatabaseHandle;
}): SQL<boolean> => {
  const viewerFollowsAuthor = viewerProfileId
    ? exists(
        db
          .select({ id: ProfileFollows.id })
          .from(ProfileFollows)
          .where(
            and(
              eq(ProfileFollows.followerProfileId, viewerProfileId),
              eq(ProfileFollows.followeeProfileId, post.profileId),
            ),
          ),
      )
    : undefined;

  return postVisibilityCondition({
    columns: {
      authorProfileId: post.profileId,
      authorVisible: profileVisible,
      postState: post.state,
      postVisibility: post.visibility,
    },
    viewerFollowsAuthor,
    viewerProfileId,
  });
};
