import { db, Notifications } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { match } from 'ts-pattern';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { Post } from '@/graphql/resolvers/post/ref';
import { ProfileFollow, ProfileFollowRequest } from '@/graphql/resolvers/profile/ref';
import { Reaction } from '@/graphql/resolvers/reaction/ref';
import { visibleNotificationWhere, visibleViewerNotificationWhere } from './access/visibility';
import type { OperationalNotificationData } from '@kosmo/core/db';
import type { UserContext } from '@/context';
import type { ProfileFollowRequestRow } from '@/graphql/resolvers/profile/loader/follow-request';

export type NotificationRow = typeof Notifications.$inferSelect;
export type FollowNotificationRow = NotificationRow;
export type FollowRequestNotificationRow = NotificationRow;
export type ReactionNotificationRow = NotificationRow;
export type RepostNotificationRow = NotificationRow;
export type ReplyNotificationRow = NotificationRow;
export type QuoteNotificationRow = NotificationRow;
export type MentionNotificationRow = NotificationRow;
export type OperationalNotificationRow = Omit<NotificationRow, 'data'> & {
  data: OperationalNotificationData;
};

type NotificationSource = {
  followRequest?: ProfileFollowRequestRow;
  postId?: string | null;
  profileId: string;
  type?: string;
};

export const getNotificationSource = async (
  notification: NotificationRow,
  ctx: UserContext,
): Promise<NotificationSource | null> =>
  match(notification.kind)
    .with(NotificationKind.FOLLOW, async () => {
      const follow = await ProfileFollow.getDataloader(ctx).load(notification.sourceId);
      return follow ? { profileId: follow.followerProfileId } : null;
    })
    .with(NotificationKind.FOLLOW_REQUEST, async () => {
      const followRequest = await ProfileFollowRequest.getDataloader(ctx).load(
        notification.sourceId,
      );
      return followRequest ? { followRequest, profileId: followRequest.followerProfileId } : null;
    })
    .with(NotificationKind.REACTION, async () => {
      const reaction = await Reaction.getDataloader(ctx).load(notification.sourceId);
      return reaction
        ? {
            postId: reaction.postId,
            profileId: reaction.profileId,
            type: reaction.type,
          }
        : null;
    })
    .with(NotificationKind.QUOTE, NotificationKind.MENTION, NotificationKind.REPLY, async () => {
      const post = await Post.getDataloader(ctx).load(notification.sourceId);
      return post ? { postId: post.id, profileId: post.profileId } : null;
    })
    .with(NotificationKind.REPOST, async () => {
      const repost = await Post.getDataloader(ctx).load(notification.sourceId);
      return repost ? { postId: repost.repostSourceId, profileId: repost.profileId } : null;
    })
    .with(NotificationKind.OPERATIONAL, () => null)
    .exhaustive();

export const notificationNodeType = (kind: string) =>
  match(kind)
    .with(NotificationKind.FOLLOW, () => 'FollowNotification' as const)
    .with(NotificationKind.FOLLOW_REQUEST, () => 'FollowRequestNotification' as const)
    .with(NotificationKind.REACTION, () => 'ReactionNotification' as const)
    .with(NotificationKind.REPOST, () => 'RepostNotification' as const)
    .with(NotificationKind.QUOTE, () => 'QuoteNotification' as const)
    .with(NotificationKind.REPLY, () => 'ReplyNotification' as const)
    .with(NotificationKind.MENTION, () => 'MentionNotification' as const)
    .with(NotificationKind.OPERATIONAL, () => 'OperationalNotification' as const)
    .otherwise(() => null);

export const notificationKindForNodeType = (typename: string) =>
  match(typename)
    .with('FollowNotification', () => NotificationKind.FOLLOW)
    .with('FollowRequestNotification', () => NotificationKind.FOLLOW_REQUEST)
    .with('ReactionNotification', () => NotificationKind.REACTION)
    .with('RepostNotification', () => NotificationKind.REPOST)
    .with('QuoteNotification', () => NotificationKind.QUOTE)
    .with('ReplyNotification', () => NotificationKind.REPLY)
    .with('MentionNotification', () => NotificationKind.MENTION)
    .with('OperationalNotification', () => NotificationKind.OPERATIONAL)
    .otherwise(() => null);

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

export const FollowRequestNotification = createObjectRef<FollowRequestNotificationRow>(
  'FollowRequestNotification',
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
          visibleNotificationWhere({ ctx }),
        ),
      ),
);

FollowRequestNotification.implement({
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
      nullable: true,
      resolve: async (notification, _, ctx) =>
        (await getNotificationSource(notification, ctx))?.type ?? null,
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

export const ReplyNotification = createObjectRef<ReplyNotificationRow>(
  'ReplyNotification',
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.REPLY),
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

export const QuoteNotification = createObjectRef<QuoteNotificationRow>(
  'QuoteNotification',
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.QUOTE),
          visibleNotificationWhere({ ctx }),
        ),
      ),
);

QuoteNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
});

export const MentionNotification = createObjectRef<MentionNotificationRow>(
  'MentionNotification',
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.MENTION),
          visibleNotificationWhere({ ctx }),
        ),
      ),
);

MentionNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
});

export const OperationalNotification = createObjectRef<OperationalNotificationRow>(
  'OperationalNotification',
  (ids, ctx) =>
    db
      .select(getColumns(Notifications))
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.OPERATIONAL),
          visibleViewerNotificationWhere({ ctx, profileId: null }),
        ),
      )
      .then((rows) => rows as OperationalNotificationRow[]),
);

OperationalNotification.implement({
  interfaces: [Notification],
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    readAt: t.expose('readAt', { type: 'DateTime', nullable: true }),
  }),
});
