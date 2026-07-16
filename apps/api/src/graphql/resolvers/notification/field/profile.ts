import { AccountProfiles, db, Notifications, ProfileFollows } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { and, count, eq, isNull } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import {
  NotificationRecipientProfiles,
  NotificationRelatedInstances,
  NotificationRelatedProfiles,
  visibleFollowNotificationWhere,
} from '../access/visibility';

builder.objectField(Profile, 'unreadNotificationCount', (t) =>
  t.withAuth({ login: true }).field({
    type: 'Int',
    resolve: async (profile, _, ctx) => {
      const membership = await db
        .select({ id: AccountProfiles.id })
        .from(AccountProfiles)
        .where(
          and(
            eq(AccountProfiles.accountId, ctx.session.accountId),
            eq(AccountProfiles.profileId, profile.id),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new PermissionDeniedError('Profile membership is required');
      }

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
