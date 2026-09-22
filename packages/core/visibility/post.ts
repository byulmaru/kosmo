import { and, eq, exists, inArray, isNotNull, isNull, ne, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Instances, Posts, ProfileBlocks, ProfileFollows, ProfileMutes, Profiles } from '../db';
import { PostState, PostVisibility } from '../enums';
import { visibleProfileWhere } from './profile';
import { profileBlockVisibilityWhere } from './profile-block';
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
  includeProfileBlock = true,
}: {
  readonly post: VisiblePost;
  readonly profileVisible: SQL<boolean>;
  readonly viewerProfileId?: SQLWrapper | string | null;
  readonly db: DatabaseHandle;
  readonly includeProfileBlock?: boolean;
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
              profileBlockVisibilityWhere({
                database: db,
                ownerProfileId: viewerProfileId,
                targetProfileId: post.profileId,
              }),
              profileBlockVisibilityWhere({
                database: db,
                ownerProfileId: post.profileId,
                targetProfileId: viewerProfileId,
              }),
            ),
          ),
      )
    : undefined;

  return sql<boolean>`${and(
    includeProfileBlock && viewerProfileId !== undefined && viewerProfileId !== null
      ? profileBlockVisibilityWhere({
          database: db,
          ownerProfileId: post.profileId,
          targetProfileId: viewerProfileId,
        })
      : undefined,
    postVisibilityCondition({
      columns: {
        authorProfileId: post.profileId,
        authorVisible: profileVisible,
        postState: post.state,
        postVisibility: post.visibility,
      },
      viewerFollowsAuthor,
      viewerProfileId,
    }),
  )!}`;
};

const ProfileListDirectSources = alias(Posts, 'profile_list_direct_source');
const ProfileListDirectSourceProfiles = alias(Profiles, 'profile_list_direct_source_profile');
const ProfileListDirectSourceInstances = alias(Instances, 'profile_list_direct_source_instance');

export const profilePostListAccessWhere = ({
  db,
  visitedProfileId,
  viewerProfileId,
}: {
  readonly db: DatabaseHandle;
  readonly visitedProfileId: string;
  readonly viewerProfileId?: string | null;
}): SQL<boolean> => {
  const postVisible = visiblePostWhere({
    post: Posts,
    profileVisible: sql<boolean>`${visibleProfileWhere({ profile: Profiles, instance: Instances })}`,
    viewerProfileId,
    db,
  });
  const directSourceVisible = visiblePostWhere({
    post: ProfileListDirectSources,
    profileVisible: sql<boolean>`${visibleProfileWhere({
      profile: ProfileListDirectSourceProfiles,
      instance: ProfileListDirectSourceInstances,
    })}`,
    viewerProfileId,
    db,
  });
  const directSourceAccessible = or(
    isNotNull(Posts.currentContentId),
    isNull(Posts.repostSourceId),
    and(
      isNull(Posts.currentContentId),
      isNull(Posts.replyParentId),
      exists(
        db
          .select({ id: ProfileListDirectSources.id })
          .from(ProfileListDirectSources)
          .innerJoin(
            ProfileListDirectSourceProfiles,
            eq(ProfileListDirectSourceProfiles.id, ProfileListDirectSources.profileId),
          )
          .innerJoin(
            ProfileListDirectSourceInstances,
            eq(ProfileListDirectSourceInstances.id, ProfileListDirectSourceProfiles.instanceId),
          )
          .where(
            and(
              eq(ProfileListDirectSources.id, Posts.repostSourceId),
              isNotNull(ProfileListDirectSources.currentContentId),
              directSourceVisible,
            ),
          ),
      ),
    ),
  );

  if (!viewerProfileId) {
    return sql<boolean>`${and(postVisible, directSourceAccessible)!}`;
  }

  const directSourceExcluded = exists(
    db
      .select({ id: ProfileListDirectSources.id })
      .from(ProfileListDirectSources)
      .where(
        and(
          eq(ProfileListDirectSources.id, Posts.repostSourceId),
          or(
            exists(
              db
                .select({ id: ProfileMutes.id })
                .from(ProfileMutes)
                .where(
                  and(
                    eq(ProfileMutes.ownerProfileId, viewerProfileId),
                    eq(ProfileMutes.targetProfileId, ProfileListDirectSources.profileId),
                    ne(ProfileMutes.targetProfileId, visitedProfileId),
                    isNull(ProfileMutes.expiresAt),
                  ),
                ),
            ),
            exists(
              db
                .select({ id: ProfileBlocks.id })
                .from(ProfileBlocks)
                .where(
                  or(
                    and(
                      eq(ProfileBlocks.ownerProfileId, viewerProfileId),
                      eq(ProfileBlocks.targetProfileId, ProfileListDirectSources.profileId),
                      ne(ProfileBlocks.targetProfileId, visitedProfileId),
                    ),
                    and(
                      eq(ProfileBlocks.ownerProfileId, ProfileListDirectSources.profileId),
                      eq(ProfileBlocks.targetProfileId, viewerProfileId),
                    ),
                  ),
                ),
            ),
          ),
        ),
      ),
  );

  return sql<boolean>`${and(postVisible, directSourceAccessible, not(directSourceExcluded))!}`;
};
