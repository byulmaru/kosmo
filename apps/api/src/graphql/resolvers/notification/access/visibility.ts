import { AccountProfiles, db, Notifications, Posts } from '@kosmo/core/db';
import { notificationSourceAvailabilityWhere } from '@kosmo/core/visibility';
import { and, eq, exists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '@kosmo/core/db';
import type { UserContext } from '@/context';

/** Source-loader aliases remain here; availability aliases live privately in core. */
export const NotificationSourceReposts = alias(Posts, 'notification_source_repost');
export const NotificationRepostRelatedPosts = alias(Posts, 'notification_repost_related_post');

export const notificationMembershipWhere = (accountId: string, database: Database) =>
  exists(
    database
      .select({ id: AccountProfiles.id })
      .from(AccountProfiles)
      .where(
        and(
          eq(AccountProfiles.accountId, accountId),
          eq(AccountProfiles.profileId, Notifications.recipientProfileId),
        ),
      ),
  );

export const visibleNotificationWhere = ({ ctx }: { ctx: UserContext }) => {
  const accountId = ctx.session?.accountId;

  return and(
    accountId ? notificationMembershipWhere(accountId, db) : sql`1=0`,
    notificationSourceAvailabilityWhere(db, { includeRecipientAvailability: true }),
  )!;
};
