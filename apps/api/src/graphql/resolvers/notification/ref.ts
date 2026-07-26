import { db, Notifications, Posts, ProfileFollows, Reactions } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import {
  NotificationRepostRelatedPosts,
  NotificationSourceReposts,
  visibleNotificationWhere,
} from './access/visibility';
import type { UserContext } from '@/context';

export type NotificationRow = typeof Notifications.$inferSelect;
export type FollowNotificationRow = NotificationRow;
export type ReactionNotificationRow = NotificationRow;
export type RepostNotificationRow = NotificationRow;

type NotificationSource = {
  post?: typeof Posts.$inferSelect;
  profileId: string;
  type?: string;
};

type FollowNotificationSourceRow = {
  id: string;
  profileId: string;
};

type ReactionNotificationSourceRow = {
  id: string;
  post: typeof Posts.$inferSelect;
  profileId: string;
  type: string;
};

type RepostNotificationSourceRow = {
  id: string;
  post: typeof Posts.$inferSelect;
  profileId: string;
};

const followNotificationSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, FollowNotificationSourceRow, string, true>({
    name: 'notification.followSource',
    nullable: true,
    load: (ids) =>
      db
        .select({ id: ProfileFollows.id, profileId: ProfileFollows.followerProfileId })
        .from(ProfileFollows)
        .where(inArray(ProfileFollows.id, ids)),
    key: (source) => source?.id ?? null,
  });

const reactionNotificationSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, ReactionNotificationSourceRow, string, true>({
    name: 'notification.reactionSource',
    nullable: true,
    load: (ids) =>
      db
        .select({
          id: Reactions.id,
          post: getColumns(Posts),
          profileId: Reactions.profileId,
          type: Reactions.type,
        })
        .from(Reactions)
        .innerJoin(Posts, eq(Posts.id, Reactions.postId))
        .where(inArray(Reactions.id, ids)),
    key: (source) => source?.id ?? null,
  });

const repostNotificationSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, RepostNotificationSourceRow, string, true>({
    name: 'notification.repostSource',
    nullable: true,
    load: (ids) =>
      db
        .select({
          id: NotificationSourceReposts.id,
          post: getColumns(NotificationRepostRelatedPosts),
          profileId: NotificationSourceReposts.profileId,
        })
        .from(NotificationSourceReposts)
        .innerJoin(
          NotificationRepostRelatedPosts,
          eq(NotificationRepostRelatedPosts.id, NotificationSourceReposts.repostSourceId),
        )
        .where(inArray(NotificationSourceReposts.id, ids)),
    key: (source) => source?.id ?? null,
  });

export const getNotificationSource = async (
  notification: NotificationRow,
  ctx: UserContext,
): Promise<NotificationSource> => {
  const source =
    notification.kind === NotificationKind.FOLLOW
      ? await followNotificationSourceLoader(ctx).load(notification.sourceId)
      : notification.kind === NotificationKind.REACTION
        ? await reactionNotificationSourceLoader(ctx).load(notification.sourceId)
        : await repostNotificationSourceLoader(ctx).load(notification.sourceId);

  if (!source) {
    throw new Error('Notification source not found');
  }

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
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.FOLLOW),
          visibleNotificationWhere({ ctx }),
        ),
      ),
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
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
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
      resolve: async (notification, _, ctx) =>
        (await getNotificationSource(notification, ctx)).type!,
    }),
  }),
});

export const RepostNotification = createObjectRef<RepostNotificationRow>(
  'RepostNotification',
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
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
