import { db, Posts, ProfileMutes } from '@kosmo/core/db';
import { and, eq, exists, isNull, ne, not } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { postRepostSourceAccessWhere } from './repost-source';
import { postVisibilityAccessWhere } from './visibility';
import type { PostProfileBlockMode } from '@kosmo/core/visibility';
import type { SQLWrapper } from 'drizzle-orm';
import type { UserContext } from '@/context';

const DirectRepostSources = alias(Posts, 'muted_direct_repost_source');

export const postAccessWhere = ({
  ctx,
  profileMute,
  profileBlockMode,
}: {
  ctx: UserContext;
  profileMute: 'ignore' | 'exclude' | { excludeExcept: string };
  readonly profileBlockMode?: PostProfileBlockMode;
}) => {
  const accessWhere = and(
    postVisibilityAccessWhere({ ctx, profileBlockMode }),
    postRepostSourceAccessWhere({ ctx, profileBlockMode }),
  );
  const ownerProfileId = ctx.session?.profile?.id;
  if (profileMute === 'ignore' || !ownerProfileId) {
    return accessWhere;
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
    accessWhere,
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
