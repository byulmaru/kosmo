import { db, Posts, ProfileMutes } from '@kosmo/core/db';
import { and, eq, exists, isNull, ne, not } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { directPostRepostSourceAccessWhere, postRepostSourceAccessWhere } from './repost-source';
import { directPostVisibilityAccessWhere, postVisibilityAccessWhere } from './visibility';
import type { SQLWrapper } from 'drizzle-orm';
import type { UserContext } from '@/context';

const DirectRepostSources = alias(Posts, 'muted_direct_repost_source');
type ProfileMuteMode = 'ignore' | 'exclude' | { excludeExcept: string };

const profileMuteWhere = ({
  ctx,
  profileMute,
}: {
  ctx: UserContext;
  profileMute: ProfileMuteMode;
}) => {
  const ownerProfileId = ctx.session?.profile?.id;
  if (profileMute === 'ignore' || !ownerProfileId) {
    return undefined;
  }

  const mutedAuthorWhere = (targetProfileId: SQLWrapper) =>
    exists(
      db
        .select({ id: ProfileMutes.id })
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, ownerProfileId),
            eq(ProfileMutes.targetProfileId, targetProfileId),
            isNull(ProfileMutes.expiresAt),
            typeof profileMute === 'object'
              ? ne(ProfileMutes.targetProfileId, profileMute.excludeExcept)
              : undefined,
          ),
        ),
    );

  return and(
    not(mutedAuthorWhere(Posts.profileId)),
    not(
      exists(
        db
          .select({ id: DirectRepostSources.id })
          .from(DirectRepostSources)
          .where(
            and(
              eq(DirectRepostSources.id, Posts.repostSourceId),
              mutedAuthorWhere(DirectRepostSources.profileId),
            ),
          ),
      ),
    ),
  );
};

export const directPostAccessWhere = ({
  ctx,
  profileMute,
}: {
  readonly ctx: UserContext;
  readonly profileMute: ProfileMuteMode;
}) =>
  and(
    directPostVisibilityAccessWhere({ ctx }),
    directPostRepostSourceAccessWhere({ ctx }),
    profileMuteWhere({ ctx, profileMute }),
  );

export const postAccessWhere = ({
  ctx,
  profileMute,
}: {
  readonly ctx: UserContext;
  readonly profileMute: ProfileMuteMode;
}) =>
  and(
    postVisibilityAccessWhere({ ctx }),
    postRepostSourceAccessWhere({ ctx }),
    profileMuteWhere({ ctx, profileMute }),
  );
