import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { visiblePostWhere } from '@kosmo/core/visibility';
import { sql } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

export const postVisibilityAccessWhere = ({ ctx }: { ctx: UserContext }) =>
  visiblePostWhere({
    post: Posts,
    profileVisible: sql<boolean>`${visibleProfileWhere({
      profile: Profiles,
      instance: Instances,
    })}`,
    viewerProfileId: ctx.session?.profileId,
    db,
  });
