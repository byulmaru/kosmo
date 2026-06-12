import { Posts } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { UserContext } from '@/context';

export const postVisibilityAccessWhere = ({ ctx }: { ctx: UserContext }) => {
  const publicWhere = inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]);
  const visibleWhere = ctx.session?.profileId
    ? or(publicWhere, eq(Posts.profileId, ctx.session.profileId))!
    : publicWhere;

  // TODO(PROD-121): Extend this helper with viewer-specific follower/direct access.
  return and(eq(Posts.state, PostState.ACTIVE), visibleWhere)!;
};
