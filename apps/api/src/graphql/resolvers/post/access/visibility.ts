import { Posts } from '@kosmo/core/db';
import { eq, inArray, or } from 'drizzle-orm';
import type { PostVisibility } from '@kosmo/core/enums';
import type { UserContext } from '@/context';

export const postVisibilityAccessWhere = ({
  ctx,
  publicVisibilities,
}: {
  ctx: UserContext;
  publicVisibilities: [PostVisibility, ...PostVisibility[]];
}) => {
  const publicWhere = inArray(Posts.visibility, publicVisibilities);

  // TODO(PROD-121): Extend this helper with viewer-specific follower/direct access.
  return ctx.session?.profileId
    ? or(publicWhere, eq(Posts.profileId, ctx.session.profileId))!
    : publicWhere;
};
