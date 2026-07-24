import { db, Notifications, Posts, ProfileFollows, Reactions } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import {
  NotificationRecipientProfiles,
  NotificationRelatedInstances,
  NotificationRelatedProfiles,
  visibleNotificationWhere,
} from './access/visibility';

export type NotificationRow = typeof Notifications.$inferSelect;
export type FollowNotificationRow = NotificationRow & { profileId: string };
export type ReactionNotificationRow = NotificationRow & {
  post: typeof Posts.$inferSelect;
  profileId: string;
  type: string;
};
export type ReplyNotificationRow = NotificationRow & {
  post: typeof Posts.$inferSelect;
  profileId: string;
};

const ReplyNotificationParents = alias(Posts, 'reply_notification_parent');

type NotificationSource = {
  post?: typeof Posts.$inferSelect;
  profileId: string;
  type?: string;
};

const notificationSourceCache = new WeakMap<NotificationRow, Promise<NotificationSource>>();

export const getNotificationSource = (
  notification: NotificationRow,
): Promise<NotificationSource> => {
  const concreteNotification = notification as NotificationRow & Partial<NotificationSource>;
  if (concreteNotification.profileId) {
    return Promise.resolve({
      post: concreteNotification.post,
      profileId: concreteNotification.profileId,
      type: concreteNotification.type,
    });
  }

  const cached = notificationSourceCache.get(notification);
  if (cached) {
    return cached;
  }

  const source = (async (): Promise<NotificationSource> => {
    switch (notification.kind) {
      case NotificationKind.FOLLOW: {
        const [row] = await db
          .select({ profileId: ProfileFollows.followerProfileId })
          .from(ProfileFollows)
          .where(eq(ProfileFollows.id, notification.sourceId))
          .limit(1);
        if (row) {
          return row;
        }
        break;
      }
      case NotificationKind.REACTION: {
        const [row] = await db
          .select({
            post: getColumns(Posts),
            profileId: Reactions.profileId,
            type: Reactions.type,
          })
          .from(Reactions)
          .innerJoin(Posts, eq(Posts.id, Reactions.postId))
          .where(eq(Reactions.id, notification.sourceId))
          .limit(1);
        if (row) {
          return row;
        }
        break;
      }
      case NotificationKind.REPLY: {
        const [row] = await db
          .select({
            post: getColumns(Posts),
            profileId: Posts.profileId,
          })
          .from(Posts)
          .innerJoin(ReplyNotificationParents, eq(ReplyNotificationParents.id, Posts.replyParentId))
          .where(
            and(
              eq(Posts.id, notification.sourceId),
              eq(ReplyNotificationParents.profileId, notification.recipientProfileId),
            ),
          )
          .limit(1);
        if (row) {
          return row;
        }
        break;
      }
    }

    throw new Error('Notification source not found');
  })();

  notificationSourceCache.set(notification, source);
  return source;
};

export const notificationNodeType = (kind: string) =>
  kind === NotificationKind.FOLLOW
    ? ('FollowNotification' as const)
    : kind === NotificationKind.REACTION
      ? ('ReactionNotification' as const)
      : kind === NotificationKind.REPLY
        ? ('ReplyNotification' as const)
        : null;

export const notificationKindForNodeType = (typename: string) =>
  typename === 'FollowNotification'
    ? NotificationKind.FOLLOW
    : typename === 'ReactionNotification'
      ? NotificationKind.REACTION
      : typename === 'ReplyNotification'
        ? NotificationKind.REPLY
        : null;

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

export const NotificationConnection = builder.connectionObject(
  {
    type: Notification,
    name: 'NotificationConnection',
  },
  {
    name: 'NotificationConnectionEdge',
  },
);

export const FollowNotification = createObjectRef<FollowNotificationRow>(
  'FollowNotification',
  async (ids, ctx) => {
    const rows = await db
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
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.FOLLOW),
          visibleNotificationWhere({ ctx }),
        ),
      );

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

export const ReactionNotification = createObjectRef<ReactionNotificationRow>(
  'ReactionNotification',
  async (ids, ctx) =>
    db
      .select({
        ...getColumns(Notifications),
        post: getColumns(Posts),
        profileId: Reactions.profileId,
        type: Reactions.type,
      })
      .from(Notifications)
      .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
      .innerJoin(Posts, eq(Posts.id, Reactions.postId))
      .innerJoin(
        NotificationRelatedProfiles,
        eq(NotificationRelatedProfiles.id, Reactions.profileId),
      )
      .innerJoin(
        NotificationRelatedInstances,
        eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
      )
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.REACTION),
          visibleNotificationWhere({ ctx }),
        ),
      ),
);

ReactionNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
    type: t.string({
      resolve: async (notification) => (await getNotificationSource(notification)).type!,
    }),
  }),
});

export const ReplyNotification = createObjectRef<ReplyNotificationRow>(
  'ReplyNotification',
  async (ids, ctx) =>
    db
      .select({
        ...getColumns(Notifications),
        post: getColumns(Posts),
        profileId: Posts.profileId,
      })
      .from(Notifications)
      .innerJoin(Posts, eq(Posts.id, Notifications.sourceId))
      .innerJoin(ReplyNotificationParents, eq(ReplyNotificationParents.id, Posts.replyParentId))
      .innerJoin(NotificationRelatedProfiles, eq(NotificationRelatedProfiles.id, Posts.profileId))
      .innerJoin(
        NotificationRelatedInstances,
        eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
      )
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.REPLY),
          eq(ReplyNotificationParents.profileId, Notifications.recipientProfileId),
          visibleNotificationWhere({ ctx }),
        ),
      ),
);

ReplyNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
});
