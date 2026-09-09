import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { profileBlockVisibilityWhere, visiblePostWhere } from '@kosmo/core/visibility';
import { and, sql } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

export const directPostVisibilityAccessWhere = ({ ctx }: { readonly ctx: UserContext }) =>
  visiblePostWhere({
    post: Posts,
    profileVisible: sql<boolean>`${visibleProfileWhere({
      profile: Profiles,
      instance: Instances,
    })}`,
    viewerProfileId: ctx.session?.profile?.id,
    db,
  });

export const postVisibilityAccessWhere = ({ ctx }: { readonly ctx: UserContext }) =>
  and(
    directPostVisibilityAccessWhere({ ctx }),
    ctx.session?.profile?.id
      ? profileBlockVisibilityWhere({
          database: db,
          ownerProfileId: ctx.session.profile.id,
          targetProfileId: Posts.profileId,
        })
      : undefined,
  )!;
