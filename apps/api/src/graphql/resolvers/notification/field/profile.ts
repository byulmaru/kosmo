import { AccountProfiles, db, Notifications } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { and, count, eq, isNull } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleNotificationWhere } from '../access/visibility';
import { Notification, NotificationConnection } from '../ref';
import { resolveNotificationPage } from './notification-page';
import type { Database } from '@kosmo/core/db';

const requireProfileNotificationMembership = async (
  accountId: string,
  profileId: string,
  database: Database,
) => {
  const membership = await database
    .select({ id: AccountProfiles.id })
    .from(AccountProfiles)
    .where(and(eq(AccountProfiles.accountId, accountId), eq(AccountProfiles.profileId, profileId)))
    .limit(1);

  if (membership.length === 0) {
    throw new PermissionDeniedError('Profile membership is required');
  }
};

builder.objectField(Profile, 'notifications', (t) =>
  t.withAuth({ login: true }).connection(
    {
      type: Notification,
      resolve: async (profile, args, ctx) => {
        await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

        return resolveNotificationPage(
          args,
          and(eq(Notifications.recipientProfileId, profile.id), visibleNotificationWhere({ ctx }))!,
        );
      },
    },
    NotificationConnection as never,
  ),
);

builder.objectField(Profile, 'unreadNotificationCount', (t) =>
  t.withAuth({ login: true }).field({
    type: 'Int',
    nullable: true,
    resolve: async (profile, _, ctx) => {
      await requireProfileNotificationMembership(ctx.session.accountId, profile.id, db);

      const [result] = await db
        .select({ count: count() })
        .from(Notifications)
        .where(
          and(
            eq(Notifications.recipientProfileId, profile.id),
            isNull(Notifications.readAt),
            visibleNotificationWhere({ ctx }),
          ),
        );

      return result?.count ?? 0;
    },
  }),
);
