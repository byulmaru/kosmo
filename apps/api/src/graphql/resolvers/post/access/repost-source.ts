import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { and, eq, exists, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import { postVisibilityAccessCondition } from './visibility';
import type { SQL } from 'drizzle-orm';
import type { UserContext } from '@/context';

const DirectRepostSources = alias(Posts, 'direct_repost_source');
const DirectRepostSourceProfiles = alias(Profiles, 'direct_repost_source_profile');
const DirectRepostSourceInstances = alias(Instances, 'direct_repost_source_instance');

export const postRepostSourceAccessWhere = ({ ctx }: { ctx: UserContext }): SQL<boolean> => {
  const directSourceVisible = postVisibilityAccessCondition({
    columns: {
      postProfileId: DirectRepostSources.profileId,
      postState: DirectRepostSources.state,
      postVisibility: DirectRepostSources.visibility,
      profileVisible: sql<boolean>`${visibleProfileWhere({
        profile: DirectRepostSourceProfiles,
        instance: DirectRepostSourceInstances,
      })}`,
    },
    viewerProfileId: ctx.session?.profileId,
  });

  return sql<boolean>`${or(
    isNotNull(Posts.currentContentId),
    isNull(Posts.repostSourceId),
    and(
      isNull(Posts.currentContentId),
      isNull(Posts.replyParentId),
      exists(
        db
          .select({ id: DirectRepostSources.id })
          .from(DirectRepostSources)
          .innerJoin(
            DirectRepostSourceProfiles,
            eq(DirectRepostSourceProfiles.id, DirectRepostSources.profileId),
          )
          .innerJoin(
            DirectRepostSourceInstances,
            eq(DirectRepostSourceInstances.id, DirectRepostSourceProfiles.instanceId),
          )
          .where(
            and(
              eq(DirectRepostSources.id, Posts.repostSourceId),
              isNotNull(DirectRepostSources.currentContentId),
              directSourceVisible,
            ),
          ),
      ),
    ),
  )!}`;
};
