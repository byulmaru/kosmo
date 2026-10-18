import { AccountProfiles, Accounts, db, Notifications } from '@kosmo/core/db';
import { AccountState, NotificationKind } from '@kosmo/core/enums';
import { and, eq, exists, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
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

const activeAccountWhere = (accountId: string) =>
  exists(
    db
      .select({ id: Accounts.id })
      .from(Accounts)
      .where(and(eq(Accounts.id, accountId), eq(Accounts.state, AccountState.ACTIVE))),
  );

const recipientAccountWhere = (accountId: string) =>
  and(eq(Notifications.recipientAccountId, accountId), activeAccountWhere(accountId));

const socialRecipientWhere = (accountId: string) =>
  and(
    activeAccountWhere(accountId),
    or(eq(Notifications.recipientAccountId, accountId), isNull(Notifications.recipientAccountId)),
  );

export const visibleViewerNotificationWhere = ({
  ctx,
  profileId,
}: {
  ctx: UserContext;
  profileId?: string | null;
}) => {
  const accountId = ctx.session?.accountId;
  if (!accountId) {
    return sql`1=0`;
  }

  const recipientAccount = recipientAccountWhere(accountId);
  const accountOnlyNotifications = and(
    recipientAccount,
    eq(Notifications.kind, NotificationKind.OPERATIONAL),
    isNull(Notifications.recipientProfileId),
  );

  if (profileId === null) {
    return accountOnlyNotifications;
  }

  const profileNotifications = and(
    socialRecipientWhere(accountId),
    ne(Notifications.kind, NotificationKind.OPERATIONAL),
    isNotNull(Notifications.recipientProfileId),
    profileId === undefined ? undefined : eq(Notifications.recipientProfileId, profileId),
    notificationMembershipWhere(accountId, db),
  );

  return or(profileNotifications, accountOnlyNotifications);
};

export const visibleNotificationWhere = ({ ctx }: { ctx: UserContext }) => {
  const accountId = ctx.session?.accountId;
  return accountId
    ? and(
        socialRecipientWhere(accountId),
        ne(Notifications.kind, NotificationKind.OPERATIONAL),
        isNotNull(Notifications.recipientProfileId),
        notificationMembershipWhere(accountId, db),
      )
    : sql`1=0`;
};
