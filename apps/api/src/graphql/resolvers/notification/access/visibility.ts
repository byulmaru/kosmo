import {
  AccountProfiles,
  db,
  Instances,
  Notifications,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { NotificationKind, ProfileState } from '@kosmo/core/enums';
import { and, eq, exists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { UserContext } from '@/context';

export const NotificationRecipientProfiles = alias(Profiles, 'notification_recipient_profile');
export const NotificationRelatedProfiles = alias(Profiles, 'notification_related_profile');
export const NotificationRelatedInstances = alias(Instances, 'notification_related_instance');

export const notificationMembershipWhere = ({
  accountId,
  recipientProfileId = Notifications.recipientProfileId,
}: {
  accountId: string;
  recipientProfileId?: AnyPgColumn;
}) =>
  exists(
    db
      .select({ id: AccountProfiles.id })
      .from(AccountProfiles)
      .where(
        and(
          eq(AccountProfiles.accountId, accountId),
          eq(AccountProfiles.profileId, recipientProfileId),
        ),
      ),
  );

export const visibleFollowNotificationWhere = ({ ctx }: { ctx: UserContext }) => {
  const accountId = ctx.session?.accountId;

  return and(
    accountId ? notificationMembershipWhere({ accountId }) : sql`1=0`,
    eq(Notifications.kind, NotificationKind.FOLLOW),
    eq(ProfileFollows.followeeProfileId, Notifications.recipientProfileId),
    eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE),
    visibleProfileWhere({
      instance: NotificationRelatedInstances,
      profile: NotificationRelatedProfiles,
    }),
  )!;
};
