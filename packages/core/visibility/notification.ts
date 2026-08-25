import { and, eq, exists, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
import {
  Instances,
  Notifications,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, PostState, ProfileState } from '../enums';
import { visiblePostWhere } from './post';
import { visibleProfileWhere } from './profile';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseHandle } from '../db';

const NotificationRecipientProfiles = alias(Profiles, 'notification_availability_recipient');
const NotificationRelatedProfiles = alias(Profiles, 'notification_availability_related_profile');
const NotificationRelatedInstances = alias(Instances, 'notification_availability_related_instance');
const NotificationFollowRequestRecipientInstances = alias(
  Instances,
  'notification_availability_follow_request_recipient_instance',
);
const NotificationReactionRecipientInstances = alias(
  Instances,
  'notification_availability_reaction_recipient_instance',
);
const NotificationSourceReposts = alias(Posts, 'notification_availability_source_repost');
const NotificationRepostRelatedPosts = alias(Posts, 'notification_availability_related_repost');
const NotificationRepostRecipientProfiles = alias(
  Profiles,
  'notification_availability_repost_recipient',
);
const NotificationRepostRecipientInstances = alias(
  Instances,
  'notification_availability_repost_recipient_instance',
);
const NotificationReplyPosts = alias(Posts, 'notification_availability_reply_post');
const NotificationReplyParents = alias(Posts, 'notification_availability_reply_parent');
const NotificationReplyRecipientProfiles = alias(
  Profiles,
  'notification_availability_reply_recipient',
);
const NotificationReplyRecipientInstances = alias(
  Instances,
  'notification_availability_reply_recipient_instance',
);
const NotificationReplyAuthors = alias(Profiles, 'notification_availability_reply_author');
const NotificationReplyAuthorInstances = alias(
  Instances,
  'notification_availability_reply_author_instance',
);

export type NotificationSourceAvailabilityOptions = {
  /**
   * API reads keep the Recipient's current visibility checks. Cleanup passes
   * false so a recoverable Recipient state never becomes a deletion reason.
   */
  readonly includeRecipientAvailability?: boolean;
};

const isRecipientAvailable = ({
  includeRecipientAvailability,
  profile,
  instance,
  requireLocalInstance = false,
}: {
  readonly includeRecipientAvailability: boolean;
  readonly profile: {
    readonly state: AnyPgColumn;
  };
  readonly instance: {
    readonly kind: AnyPgColumn;
    readonly state: AnyPgColumn;
  };
  readonly requireLocalInstance?: boolean;
}) => {
  if (!includeRecipientAvailability) {
    return undefined;
  }

  return and(
    eq(profile.state, ProfileState.ACTIVE),
    requireLocalInstance ? eq(instance.kind, InstanceKind.LOCAL) : undefined,
    eq(instance.state, InstanceState.ACTIVE),
  );
};

const relatedProfileAvailability = ({
  includeRecipientAvailability,
  profile,
  instance,
}: {
  readonly includeRecipientAvailability: boolean;
  readonly profile: {
    readonly id: AnyPgColumn;
    readonly state: AnyPgColumn;
  };
  readonly instance: {
    readonly state: AnyPgColumn;
  };
}) => {
  const visible = visibleProfileWhere({ instance, profile });

  // A malformed historical row may use the Recipient as its Related Profile.
  // Cleanup must still preserve it when the only unavailable fact is the
  // Recipient's own recoverable state.
  return includeRecipientAvailability
    ? visible
    : or(eq(profile.id, Notifications.recipientProfileId), visible)!;
};

/**
 * Notification kinds whose source/related-object contract is represented by
 * this predicate. Operational notifications are intentionally excluded: they
 * are Account notifications and do not have a source relationship to sweep.
 */
export const notificationSourceAvailabilityKinds = [
  NotificationKind.FOLLOW,
  NotificationKind.FOLLOW_REQUEST,
  NotificationKind.REACTION,
  NotificationKind.REPOST,
  NotificationKind.REPLY,
] as const;

/**
 * Builds the canonical viewer-independent Notification source/related-object
 * availability predicate. API callers add Account-Profile membership around
 * this predicate. Cleanup callers pass `includeRecipientAvailability: false`
 * to keep Recipient inactivity/suspension out of physical-delete eligibility.
 */
export const notificationSourceAvailabilityWhere = (
  database: DatabaseHandle,
  { includeRecipientAvailability = true }: NotificationSourceAvailabilityOptions = {},
) => {
  // Follow visibility historically checks only the Recipient Profile state;
  // keep that API contract and avoid introducing an unjoined Instance alias.
  const recipientAvailability = includeRecipientAvailability
    ? eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE)
    : undefined;
  const followRequestRecipientAvailability = isRecipientAvailable({
    includeRecipientAvailability,
    profile: NotificationRecipientProfiles,
    instance: NotificationFollowRequestRecipientInstances,
    requireLocalInstance: true,
  });
  const reactionRecipientAvailability = isRecipientAvailable({
    includeRecipientAvailability,
    profile: NotificationRecipientProfiles,
    instance: NotificationReactionRecipientInstances,
    requireLocalInstance: true,
  });
  const repostRecipientAvailability = isRecipientAvailable({
    includeRecipientAvailability,
    profile: NotificationRepostRecipientProfiles,
    instance: NotificationRepostRecipientInstances,
    requireLocalInstance: true,
  });
  const replyRecipientAvailability = isRecipientAvailable({
    includeRecipientAvailability,
    profile: NotificationReplyRecipientProfiles,
    instance: NotificationReplyRecipientInstances,
    requireLocalInstance: true,
  });

  return exists(
    unionAll(
      database
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, ProfileFollows.followeeProfileId),
        )
        .innerJoin(
          NotificationRelatedProfiles,
          eq(NotificationRelatedProfiles.id, ProfileFollows.followerProfileId),
        )
        .innerJoin(
          NotificationRelatedInstances,
          eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
        )
        .where(
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW),
            eq(ProfileFollows.id, Notifications.sourceId),
            eq(ProfileFollows.followeeProfileId, Notifications.recipientProfileId),
            recipientAvailability,
            relatedProfileAvailability({
              includeRecipientAvailability,
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      database
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, ProfileFollowRequests.followeeProfileId),
        )
        .innerJoin(
          NotificationFollowRequestRecipientInstances,
          eq(
            NotificationFollowRequestRecipientInstances.id,
            NotificationRecipientProfiles.instanceId,
          ),
        )
        .innerJoin(
          NotificationRelatedProfiles,
          eq(NotificationRelatedProfiles.id, ProfileFollowRequests.followerProfileId),
        )
        .innerJoin(
          NotificationRelatedInstances,
          eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
        )
        .where(
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
            eq(ProfileFollowRequests.id, Notifications.sourceId),
            eq(ProfileFollowRequests.followeeProfileId, Notifications.recipientProfileId),
            followRequestRecipientAvailability,
            relatedProfileAvailability({
              includeRecipientAvailability,
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      database
        .select({ id: Reactions.id })
        .from(Reactions)
        .innerJoin(Posts, eq(Posts.id, Reactions.postId))
        .innerJoin(
          NotificationRelatedProfiles,
          eq(NotificationRelatedProfiles.id, Reactions.profileId),
        )
        .innerJoin(
          NotificationRelatedInstances,
          eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
        )
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, Posts.profileId),
        )
        .innerJoin(
          NotificationReactionRecipientInstances,
          eq(NotificationReactionRecipientInstances.id, NotificationRecipientProfiles.instanceId),
        )
        .where(
          and(
            eq(Notifications.kind, NotificationKind.REACTION),
            eq(Reactions.id, Notifications.sourceId),
            eq(Posts.profileId, Notifications.recipientProfileId),
            eq(Posts.state, PostState.ACTIVE),
            reactionRecipientAvailability,
            relatedProfileAvailability({
              includeRecipientAvailability,
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      database
        .select({ id: NotificationSourceReposts.id })
        .from(NotificationSourceReposts)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.REPOST),
            eq(NotificationSourceReposts.id, Notifications.sourceId),
            eq(NotificationSourceReposts.state, PostState.ACTIVE),
            isNull(NotificationSourceReposts.currentContentId),
            isNull(NotificationSourceReposts.replyParentId),
            exists(
              database
                .select({ id: NotificationRelatedProfiles.id })
                .from(NotificationRelatedProfiles)
                .innerJoin(
                  NotificationRelatedInstances,
                  eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
                )
                .where(
                  and(
                    eq(NotificationRelatedProfiles.id, NotificationSourceReposts.profileId),
                    relatedProfileAvailability({
                      includeRecipientAvailability,
                      instance: NotificationRelatedInstances,
                      profile: NotificationRelatedProfiles,
                    }),
                  ),
                ),
            ),
            exists(
              database
                .select({ id: NotificationRepostRelatedPosts.id })
                .from(NotificationRepostRelatedPosts)
                .innerJoin(
                  NotificationRepostRecipientProfiles,
                  eq(
                    NotificationRepostRecipientProfiles.id,
                    NotificationRepostRelatedPosts.profileId,
                  ),
                )
                .innerJoin(
                  NotificationRepostRecipientInstances,
                  eq(
                    NotificationRepostRecipientInstances.id,
                    NotificationRepostRecipientProfiles.instanceId,
                  ),
                )
                .where(
                  and(
                    eq(NotificationRepostRelatedPosts.id, NotificationSourceReposts.repostSourceId),
                    eq(NotificationRepostRelatedPosts.profileId, Notifications.recipientProfileId),
                    isNotNull(NotificationRepostRelatedPosts.currentContentId),
                    repostRecipientAvailability,
                    visiblePostWhere({
                      post: NotificationRepostRelatedPosts,
                      profileVisible: includeRecipientAvailability
                        ? sql<boolean>`${visibleProfileWhere({
                            instance: NotificationRepostRecipientInstances,
                            profile: NotificationRepostRecipientProfiles,
                          })}`
                        : sql<boolean>`true`,
                      viewerProfileId: Notifications.recipientProfileId,
                      db: database,
                    }),
                  ),
                ),
            ),
          ),
        ),
      database
        .select({ id: NotificationReplyPosts.id })
        .from(NotificationReplyPosts)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.REPLY),
            eq(NotificationReplyPosts.id, Notifications.sourceId),
            exists(
              database
                .select({ id: NotificationReplyParents.id })
                .from(NotificationReplyParents)
                .innerJoin(
                  NotificationReplyRecipientProfiles,
                  eq(NotificationReplyRecipientProfiles.id, NotificationReplyParents.profileId),
                )
                .innerJoin(
                  NotificationReplyRecipientInstances,
                  eq(
                    NotificationReplyRecipientInstances.id,
                    NotificationReplyRecipientProfiles.instanceId,
                  ),
                )
                .where(
                  and(
                    eq(NotificationReplyParents.id, NotificationReplyPosts.replyParentId),
                    eq(NotificationReplyParents.profileId, Notifications.recipientProfileId),
                    replyRecipientAvailability,
                  ),
                ),
            ),
            exists(
              database
                .select({ id: NotificationReplyAuthors.id })
                .from(NotificationReplyAuthors)
                .innerJoin(
                  NotificationReplyAuthorInstances,
                  eq(NotificationReplyAuthorInstances.id, NotificationReplyAuthors.instanceId),
                )
                .where(
                  and(
                    eq(NotificationReplyAuthors.id, NotificationReplyPosts.profileId),
                    visiblePostWhere({
                      post: NotificationReplyPosts,
                      profileVisible: sql<boolean>`${relatedProfileAvailability({
                        includeRecipientAvailability,
                        instance: NotificationReplyAuthorInstances,
                        profile: NotificationReplyAuthors,
                      })}`,
                      viewerProfileId: Notifications.recipientProfileId,
                      db: database,
                    }),
                  ),
                ),
            ),
          ),
        ),
    ),
  );
};
