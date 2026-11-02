import { AccountProfiles, db, Notifications } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleViewerNotificationWhere } from '../access/visibility';
import { Notification, NotificationConnection } from '../ref';
import type { Database } from '@kosmo/core/db';
import type { NotificationRow } from '../ref';

export const requireProfileNotificationMembership = async (
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

        return resolveCursorConnection<Promise<NotificationRow[]>>(
          { args, toCursor: ({ id }) => id },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Notifications))
              .from(Notifications)
              .where(
                and(
                  visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
                  before ? gt(Notifications.id, before) : undefined,
                  after ? lt(Notifications.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Notifications.id) : desc(Notifications.id))
              .limit(limit),
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
            visibleViewerNotificationWhere({ ctx, profileId: profile.id }),
            isNull(Notifications.readAt),
          ),
        );

      return result?.count ?? 0;
    },
  }),
);
