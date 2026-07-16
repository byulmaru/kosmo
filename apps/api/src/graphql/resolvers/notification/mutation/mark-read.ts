import { db, firstOrThrowWith, Notifications, ProfileFollows } from '@kosmo/core/db';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, getColumns, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import {
  NotificationRecipientProfiles,
  NotificationRelatedInstances,
  NotificationRelatedProfiles,
  visibleFollowNotificationWhere,
} from '../access/visibility';
import { FollowNotification, Notification } from '../ref';

builder.mutationField('markNotificationRead', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('MarkNotificationReadPayload', {
      fields: (field) => ({
        notification: field.field({ type: Notification }),
        recipientProfile: field.field({ type: Profile }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: FollowNotification }),
    },
    resolve: async (_, { input }, ctx) => {
      const notification = await db
        .update(Notifications)
        .set({ readAt: sql`coalesce(${Notifications.readAt}, now())` })
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
            eq(Notifications.id, input.id.id),
            eq(ProfileFollows.id, Notifications.sourceId),
            visibleFollowNotificationWhere({ ctx }),
          ),
        )
        .returning({
          ...getColumns(Notifications),
          profileId: ProfileFollows.followerProfileId,
        })
        .then(firstOrThrowWith(() => new NotFoundError('Notification not found')));

      return {
        notification,
        recipientProfile: notification.recipientProfileId,
      };
    },
  }),
);
