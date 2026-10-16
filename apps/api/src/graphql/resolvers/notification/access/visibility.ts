import { AccountProfiles, Accounts, db, Notifications } from '@kosmo/core/db';
import { AccountState, NotificationKind } from '@kosmo/core/enums';
import { and, eq, exists, ne, or, sql } from 'drizzle-orm';
import type { Database } from '@kosmo/core/db';
import type { UserContext } from '@/context';

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

  return accountId ? notificationMembershipWhere(accountId, db) : sql`1=0`;
};

export const visibleViewerNotificationWhere = ({
  ctx,
  profileId,
}: {
  ctx: UserContext;
  profileId?: string | null;
}) => {
  const profileNotifications =
    ctx.session && profileId !== null
      ? and(
          ne(Notifications.kind, NotificationKind.OPERATIONAL),
          profileId === undefined ? undefined : eq(Notifications.recipientProfileId, profileId),
          notificationMembershipWhere(ctx.session.accountId, db),
        )
      : undefined;
  const operationalNotifications = ctx.session
    ? and(
        eq(Notifications.kind, NotificationKind.OPERATIONAL),
        eq(Notifications.recipientAccountId, ctx.session.accountId),
        exists(
          db
            .select({ id: Accounts.id })
            .from(Accounts)
            .where(
              and(
                eq(Accounts.id, Notifications.recipientAccountId),
                eq(Accounts.state, AccountState.ACTIVE),
              ),
            ),
        ),
      )
    : undefined;

  return or(profileNotifications, operationalNotifications) ?? sql`1=0`;
};
