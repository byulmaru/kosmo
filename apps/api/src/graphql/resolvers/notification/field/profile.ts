import {
  AccountProfiles,
  db,
  Notifications,
  Posts,
  ProfileFollows,
  Reactions,
} from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, getColumns, gt, isNull, lt, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleNotificationWhere } from '../access/visibility';
import { Notification, NotificationConnection } from '../ref';
import type { NotificationRow } from '../ref';

const requireProfileNotificationMembership = async (accountId: string, profileId: string) => {
  const membership = await db
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
        await requireProfileNotificationMembership(ctx.session.accountId, profile.id);

        return resolveCursorConnection<Promise<NotificationRow[]>>(
          {
            args,
            toCursor: (notification) => notification.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Notifications),
                post: getColumns(Posts),
                profileId: sql<string>`coalesce(${ProfileFollows.followerProfileId}, ${Reactions.profileId})`,
                type: Reactions.type,
              })
              .from(Notifications)
              .leftJoin(
                ProfileFollows,
                and(
                  eq(Notifications.kind, NotificationKind.FOLLOW),
                  eq(ProfileFollows.id, Notifications.sourceId),
                ),
              )
              .leftJoin(
                Reactions,
                and(
                  eq(Notifications.kind, NotificationKind.REACTION),
                  eq(Reactions.id, Notifications.sourceId),
                ),
              )
              .leftJoin(Posts, eq(Posts.id, Reactions.postId))
              .where(
                and(
                  eq(Notifications.recipientProfileId, profile.id),
                  visibleNotificationWhere({ ctx }),
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
    resolve: async (profile, _, ctx) => {
      await requireProfileNotificationMembership(ctx.session.accountId, profile.id);

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
