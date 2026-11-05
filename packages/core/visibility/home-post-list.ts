import { and, eq, exists, isNotNull, isNull, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Instances, PostMentions, Posts, ProfileFollows, ProfileMutes, Profiles } from '../db';
import { ProfileState } from '../enums';
import { visiblePostWhere } from './post';
import { visibleProfileWhere } from './profile';
import { profileBlockVisibilityWhere } from './profile-block';
import type { SQL } from 'drizzle-orm';
import type { DatabaseHandle } from '../db';
import type { ProfileIdExpression } from './profile-block';

const HomeReplyParents = alias(Posts, 'home_post_list_reply_parent');
const HomeReplyParentFollowPosts = alias(Posts, 'home_post_list_reply_parent_follow');
const HomeDirectRepostSources = alias(Posts, 'home_post_list_direct_repost_source');
const HomeDirectRepostSourceProfiles = alias(Profiles, 'home_post_list_direct_repost_profile');
const HomeDirectRepostSourceInstances = alias(Instances, 'home_post_list_direct_repost_instance');
const HomePostAuthorProfiles = alias(Profiles, 'home_post_profile_state_author');

/** Home read-time lifecycle checks for the outer and direct source authors. */
export const homePostProfileStateWhere = ({
  db,
}: {
  readonly db: DatabaseHandle;
}): SQL<boolean> => {
  const outerAuthorIsActive = exists(
    db
      .select({ id: HomePostAuthorProfiles.id })
      .from(HomePostAuthorProfiles)
      .where(
        and(
          eq(HomePostAuthorProfiles.id, Posts.profileId),
          eq(HomePostAuthorProfiles.state, ProfileState.ACTIVE),
        ),
      ),
  );
  const directSourceAuthorIsActive = or(
    isNull(Posts.repostSourceId),
    // OFFSET 0 keeps this direct-source probe correlated instead of materializing source IDs.
    sql<boolean>`exists (${db
      .select({ id: HomeDirectRepostSources.id })
      .from(HomeDirectRepostSources)
      .innerJoin(
        HomeDirectRepostSourceProfiles,
        eq(HomeDirectRepostSourceProfiles.id, HomeDirectRepostSources.profileId),
      )
      .where(
        and(
          eq(HomeDirectRepostSources.id, Posts.repostSourceId),
          eq(HomeDirectRepostSourceProfiles.state, ProfileState.ACTIVE),
        ),
      )} offset 0)`,
  );

  return sql<boolean>`${and(outerAuthorIsActive, directSourceAuthorIsActive)!}`;
};

/** Home timeline eligibility and access for one selected Profile. */
export const homePostListWhere = ({
  db,
  viewerProfileId,
}: {
  readonly db: DatabaseHandle;
  readonly viewerProfileId: ProfileIdExpression;
}): SQL<boolean> => {
  const followeeWhere = exists(
    db
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewerProfileId),
          eq(ProfileFollows.followeeProfileId, Posts.profileId),
          profileBlockVisibilityWhere({
            database: db,
            ownerProfileId: viewerProfileId,
            targetProfileId: Posts.profileId,
          }),
          profileBlockVisibilityWhere({
            database: db,
            ownerProfileId: Posts.profileId,
            targetProfileId: viewerProfileId,
          }),
        ),
      ),
  );
  const replyParentIsViewerPost = exists(
    db
      .select({ id: HomeReplyParents.id })
      .from(HomeReplyParents)
      .where(
        and(
          eq(HomeReplyParents.id, Posts.replyParentId),
          eq(HomeReplyParents.profileId, viewerProfileId),
        ),
      ),
  );
  const replyParentAuthorIsFollowee = exists(
    db
      .select({ id: HomeReplyParentFollowPosts.id })
      .from(HomeReplyParentFollowPosts)
      .innerJoin(
        ProfileFollows,
        eq(ProfileFollows.followeeProfileId, HomeReplyParentFollowPosts.profileId),
      )
      .where(
        and(
          eq(HomeReplyParentFollowPosts.id, Posts.replyParentId),
          eq(ProfileFollows.followerProfileId, viewerProfileId),
          profileBlockVisibilityWhere({
            database: db,
            ownerProfileId: ProfileFollows.followerProfileId,
            targetProfileId: ProfileFollows.followeeProfileId,
          }),
          profileBlockVisibilityWhere({
            database: db,
            ownerProfileId: ProfileFollows.followeeProfileId,
            targetProfileId: ProfileFollows.followerProfileId,
          }),
        ),
      ),
  );
  const homeCandidateWhere = or(
    eq(Posts.profileId, viewerProfileId),
    and(isNull(Posts.replyParentId), followeeWhere),
    replyParentIsViewerPost,
    and(followeeWhere, replyParentAuthorIsFollowee),
  );
  const homeMentionTargetWhere = or(
    isNull(Posts.replyParentId),
    eq(Posts.profileId, viewerProfileId),
    not(
      exists(
        db
          .select({ postContentId: PostMentions.postContentId })
          .from(PostMentions)
          .where(eq(PostMentions.postContentId, Posts.currentContentId)),
      ),
    ),
    exists(
      db
        .select({ postContentId: PostMentions.postContentId })
        .from(PostMentions)
        .where(
          and(
            eq(PostMentions.postContentId, Posts.currentContentId),
            or(
              eq(PostMentions.profileId, viewerProfileId),
              exists(
                db
                  .select({ id: ProfileFollows.id })
                  .from(ProfileFollows)
                  .where(
                    and(
                      eq(ProfileFollows.followerProfileId, viewerProfileId),
                      eq(ProfileFollows.followeeProfileId, PostMentions.profileId),
                    ),
                  ),
              ),
            ),
          ),
        ),
    ),
  );

  const postVisibilityWhere = visiblePostWhere({
    post: Posts,
    profileVisible: sql<boolean>`${visibleProfileWhere({ profile: Profiles, instance: Instances })}`,
    viewerProfileId,
    db,
  });
  const directRepostSourceVisibilityWhere = visiblePostWhere({
    post: HomeDirectRepostSources,
    profileVisible: sql<boolean>`${visibleProfileWhere({
      profile: HomeDirectRepostSourceProfiles,
      instance: HomeDirectRepostSourceInstances,
    })}`,
    viewerProfileId,
    db,
  });
  const repostSourceWhere = sql<boolean>`${or(
    isNotNull(Posts.currentContentId),
    isNull(Posts.repostSourceId),
    and(
      isNull(Posts.currentContentId),
      isNull(Posts.replyParentId),
      // OFFSET 0 keeps this direct-source probe correlated instead of materializing source IDs.
      sql<boolean>`exists (${db
        .select({ id: HomeDirectRepostSources.id })
        .from(HomeDirectRepostSources)
        .innerJoin(
          HomeDirectRepostSourceProfiles,
          eq(HomeDirectRepostSourceProfiles.id, HomeDirectRepostSources.profileId),
        )
        .innerJoin(
          HomeDirectRepostSourceInstances,
          eq(HomeDirectRepostSourceInstances.id, HomeDirectRepostSourceProfiles.instanceId),
        )
        .where(
          and(
            eq(HomeDirectRepostSources.id, Posts.repostSourceId),
            isNotNull(HomeDirectRepostSources.currentContentId),
            directRepostSourceVisibilityWhere,
            profileBlockVisibilityWhere({
              database: db,
              ownerProfileId: viewerProfileId,
              targetProfileId: HomeDirectRepostSources.profileId,
            }),
          ),
        )} offset 0)`,
    ),
  )!}`;
  const profileMuteWhere = and(
    not(
      exists(
        db
          .select({ id: ProfileMutes.id })
          .from(ProfileMutes)
          .where(
            and(
              eq(ProfileMutes.ownerProfileId, viewerProfileId),
              eq(ProfileMutes.targetProfileId, Posts.profileId),
              isNull(ProfileMutes.expiresAt),
            ),
          ),
      ),
    ),
    not(
      exists(
        db
          .select({ id: HomeDirectRepostSources.id })
          .from(HomeDirectRepostSources)
          .innerJoin(
            ProfileMutes,
            and(
              eq(ProfileMutes.ownerProfileId, viewerProfileId),
              eq(ProfileMutes.targetProfileId, HomeDirectRepostSources.profileId),
              isNull(ProfileMutes.expiresAt),
            ),
          )
          .where(eq(HomeDirectRepostSources.id, Posts.repostSourceId)),
      ),
    ),
  );

  return sql<boolean>`${and(
    homeCandidateWhere,
    homeMentionTargetWhere,
    postVisibilityWhere,
    homePostProfileStateWhere({ db }),
    profileBlockVisibilityWhere({
      database: db,
      ownerProfileId: viewerProfileId,
      targetProfileId: Posts.profileId,
    }),
    repostSourceWhere,
    profileMuteWhere,
  )!}`;
};
