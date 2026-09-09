import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { profileBlockVisibilityWhere, visiblePostWhere } from '@kosmo/core/visibility';
import { and, eq, exists, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import type { SQL } from 'drizzle-orm';
import type { UserContext } from '@/context';

const DirectRepostSources = alias(Posts, 'direct_repost_source');
const DirectRepostSourceProfiles = alias(Profiles, 'direct_repost_source_profile');
const DirectRepostSourceInstances = alias(Instances, 'direct_repost_source_instance');

const directRepostSourceVisibleWhere = ({ ctx }: { readonly ctx: UserContext }) =>
  visiblePostWhere({
    post: DirectRepostSources,
    profileVisible: sql<boolean>`${visibleProfileWhere({
      profile: DirectRepostSourceProfiles,
      instance: DirectRepostSourceInstances,
    })}`,
    viewerProfileId: ctx.session?.profile?.id,
    db,
  });

const repostSourceAccessWhere = (sourceVisible: SQL<boolean>): SQL<boolean> =>
  sql<boolean>`${or(
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
              sourceVisible,
            ),
          ),
      ),
    ),
  )!}`;

export const directPostRepostSourceAccessWhere = ({
  ctx,
}: {
  readonly ctx: UserContext;
}): SQL<boolean> => repostSourceAccessWhere(directRepostSourceVisibleWhere({ ctx }));

export const postRepostSourceAccessWhere = ({ ctx }: { readonly ctx: UserContext }): SQL<boolean> =>
  repostSourceAccessWhere(
    sql<boolean>`${and(
      directRepostSourceVisibleWhere({ ctx }),
      ctx.session?.profileId
        ? profileBlockVisibilityWhere({
            database: db,
            ownerProfileId: ctx.session.profileId,
            targetProfileId: DirectRepostSources.profileId,
          })
        : undefined,
    )!}`,
  );
