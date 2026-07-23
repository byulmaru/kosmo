import {
  AccountProfiles,
  db,
  Instances,
  Notifications,
  Posts,
  ProfileFollows,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, exists, sql } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

export const NotificationRecipientProfiles = alias(Profiles, 'notification_recipient_profile');
export const NotificationRelatedProfiles = alias(Profiles, 'notification_related_profile');
export const NotificationRelatedInstances = alias(Instances, 'notification_related_instance');
export const NotificationReactionRecipientInstances = alias(
  Instances,
  'notification_reaction_recipient_instance',
);

export const notificationMembershipWhere = (accountId: string) =>
  exists(
    db
      .select({ id: AccountProfiles.id })
      .from(AccountProfiles)
      .where(
        and(
          eq(AccountProfiles.accountId, accountId),
          eq(AccountProfiles.profileId, Notifications.recipientProfileId),
        ),
      ),
  );

const visibleNotificationSourceWhere = () =>
  exists(
    unionAll(
      db
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
            eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE),
            visibleProfileWhere({
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      db
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
            eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE),
            eq(NotificationReactionRecipientInstances.kind, InstanceKind.LOCAL),
            eq(NotificationReactionRecipientInstances.state, InstanceState.ACTIVE),
            visibleProfileWhere({
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
    ),
  );

export const visibleNotificationWhere = ({ ctx }: { ctx: UserContext }) => {
  const accountId = ctx.session?.accountId;

  return and(
    accountId ? notificationMembershipWhere(accountId) : sql`1=0`,
    visibleNotificationSourceWhere(),
  )!;
};
