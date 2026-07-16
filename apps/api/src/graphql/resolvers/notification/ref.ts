import { db, Notifications, ProfileFollows } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import {
  NotificationRecipientInstances,
  NotificationRecipientProfiles,
  NotificationRelatedInstances,
  NotificationRelatedProfiles,
  visibleFollowNotificationWhere,
} from './access/visibility';

export type NotificationRow = typeof Notifications.$inferSelect;
export type FollowNotificationRow = NotificationRow & { relatedProfileId: string };

export const notificationNodeType = (kind: string) =>
  kind === NotificationKind.FOLLOW ? ('FollowNotification' as const) : null;

export const resolveNotificationNode = (
  notification: Omit<FollowNotificationRow, 'kind'> & { kind: string },
) => {
  const __typename = notificationNodeType(notification.kind);
  return __typename ? { ...notification, __typename } : null;
};

export const Notification = builder.interfaceRef<NotificationRow>('Notification');

Notification.implement({
  interfaces: [builder.nodeInterfaceRef()],
  fields: (t) => ({
    id: t.exposeID('id'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
  resolveType: (notification) => notificationNodeType(notification.kind),
});

export const FollowNotification = createObjectRef<FollowNotificationRow>(
  'FollowNotification',
  async (ids, ctx) => {
    const rows = await db
      .select({
        ...getColumns(Notifications),
        relatedProfileId: ProfileFollows.followerProfileId,
      })
      .from(Notifications)
      .innerJoin(ProfileFollows, eq(ProfileFollows.id, Notifications.sourceId))
      .innerJoin(
        NotificationRecipientProfiles,
        eq(NotificationRecipientProfiles.id, Notifications.recipientProfileId),
      )
      .innerJoin(
        NotificationRecipientInstances,
        eq(NotificationRecipientInstances.id, NotificationRecipientProfiles.instanceId),
      )
      .innerJoin(
        NotificationRelatedProfiles,
        eq(NotificationRelatedProfiles.id, ProfileFollows.followerProfileId),
      )
      .innerJoin(
        NotificationRelatedInstances,
        eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
      )
      .where(and(inArray(Notifications.id, ids), visibleFollowNotificationWhere({ ctx })));

    return rows;
  },
);

FollowNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
});
