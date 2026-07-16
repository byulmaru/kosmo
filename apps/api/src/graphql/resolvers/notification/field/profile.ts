import { AccountProfiles, db, Notifications, ProfileFollows } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import {
  NotificationRecipientProfiles,
  NotificationRelatedInstances,
  NotificationRelatedProfiles,
  visibleFollowNotificationWhere,
} from '../access/visibility';
import { Notification, NotificationConnection } from '../ref';
import type { FollowNotificationRow } from '../ref';

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

        return resolveCursorConnection<Promise<FollowNotificationRow[]>>(
          {
            args,
            toCursor: (notification) => notification.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Notifications),
                profileId: ProfileFollows.followerProfileId,
              })
              .from(Notifications)
              .innerJoin(ProfileFollows, eq(ProfileFollows.id, Notifications.sourceId))
              .innerJoin(
                NotificationRecipientProfiles,
                eq(NotificationRecipientProfiles.id, Notifications.recipientProfileId),
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
                  eq(Notifications.recipientProfileId, profile.id),
                  visibleFollowNotificationWhere({ ctx }),
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
        .innerJoin(ProfileFollows, eq(ProfileFollows.id, Notifications.sourceId))
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, Notifications.recipientProfileId),
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
            eq(Notifications.recipientProfileId, profile.id),
            isNull(Notifications.readAt),
            visibleFollowNotificationWhere({ ctx }),
          ),
        );

      return result?.count ?? 0;
    },
  }),
);
