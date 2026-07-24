import { db, Notifications, Posts, ProfileFollows, Reactions } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import {
  NotificationRecipientProfiles,
  NotificationRelatedInstances,
  NotificationRelatedProfiles,
  NotificationRepostRelatedPosts,
  NotificationSourceReposts,
  visibleNotificationWhere,
} from './access/visibility';

export type NotificationRow = typeof Notifications.$inferSelect;
export type FollowNotificationRow = NotificationRow & { profileId: string };
export type ReactionNotificationRow = NotificationRow & {
  post: typeof Posts.$inferSelect;
  profileId: string;
  type: string;
};
export type RepostNotificationRow = NotificationRow & {
  post: typeof Posts.$inferSelect;
  profileId: string;
};

type NotificationSource = {
  post?: typeof Posts.$inferSelect;
  profileId: string;
  type?: string;
};

type PreloadedNotificationSource = Partial<NotificationSource> & {
  reactionPost?: typeof Posts.$inferSelect | null;
  repostPost?: typeof Posts.$inferSelect | null;
};

const notificationSourceCache = new WeakMap<NotificationRow, Promise<NotificationSource>>();

export const getNotificationSource = (
  notification: NotificationRow,
): Promise<NotificationSource> => {
  const concreteNotification = notification as NotificationRow & PreloadedNotificationSource;
  if (concreteNotification.profileId) {
    return Promise.resolve({
      post:
        concreteNotification.post ??
        concreteNotification.reactionPost ??
        concreteNotification.repostPost ??
        undefined,
      profileId: concreteNotification.profileId,
      type: concreteNotification.type,
    });
  }

  const cached = notificationSourceCache.get(notification);
  if (cached) {
    return cached;
  }

  const source: Promise<NotificationSource> = (
    notification.kind === NotificationKind.FOLLOW
      ? db
          .select({ profileId: ProfileFollows.followerProfileId })
          .from(ProfileFollows)
          .where(eq(ProfileFollows.id, notification.sourceId))
          .limit(1)
      : notification.kind === NotificationKind.REACTION
        ? db
            .select({
              post: getColumns(Posts),
              profileId: Reactions.profileId,
              type: Reactions.type,
            })
            .from(Reactions)
            .innerJoin(Posts, eq(Posts.id, Reactions.postId))
            .where(eq(Reactions.id, notification.sourceId))
            .limit(1)
        : db
            .select({
              post: getColumns(NotificationRepostRelatedPosts),
              profileId: NotificationSourceReposts.profileId,
            })
            .from(NotificationSourceReposts)
            .innerJoin(
              NotificationRepostRelatedPosts,
              eq(NotificationRepostRelatedPosts.id, NotificationSourceReposts.repostSourceId),
            )
            .where(eq(NotificationSourceReposts.id, notification.sourceId))
            .limit(1)
  ).then(([row]) => {
    if (!row) {
      throw new Error('Notification source not found');
    }

    return row;
  });

  notificationSourceCache.set(notification, source);
  return source;
};

export const notificationNodeType = (kind: string) =>
  kind === NotificationKind.FOLLOW
    ? ('FollowNotification' as const)
    : kind === NotificationKind.REACTION
      ? ('ReactionNotification' as const)
      : kind === NotificationKind.REPOST
        ? ('RepostNotification' as const)
        : null;

export const notificationKindForNodeType = (typename: string) =>
  typename === 'FollowNotification'
    ? NotificationKind.FOLLOW
    : typename === 'ReactionNotification'
      ? NotificationKind.REACTION
      : typename === 'RepostNotification'
        ? NotificationKind.REPOST
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

export const RepostNotification = createObjectRef<RepostNotificationRow>(
  'RepostNotification',
  async (ids, ctx) =>
    db
      .select({
        ...getColumns(Notifications),
        post: getColumns(NotificationRepostRelatedPosts),
        profileId: NotificationSourceReposts.profileId,
      })
      .from(Notifications)
      .innerJoin(
        NotificationSourceReposts,
        eq(NotificationSourceReposts.id, Notifications.sourceId),
      )
      .innerJoin(
        NotificationRepostRelatedPosts,
        eq(NotificationRepostRelatedPosts.id, NotificationSourceReposts.repostSourceId),
      )
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.REPOST),
          visibleNotificationWhere({ ctx }),
        ),
      ),
);

RepostNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
});
