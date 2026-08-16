import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { PostState, PostVisibility } from '../enums';
import type { SQL, SQLWrapper } from 'drizzle-orm';

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
