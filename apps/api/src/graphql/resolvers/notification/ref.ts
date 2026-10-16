import { db, Notifications } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { match } from 'ts-pattern';
import { builder } from '@/graphql/builder';
import { Reaction } from '@/graphql/resolvers/reaction/ref';
import { createObjectRef } from '@/graphql/utils';
import { visibleNotificationWhere, visibleViewerNotificationWhere } from './access/visibility';
import {
  followNotificationSourceByIdLoader,
  followRequestNotificationSourceByIdLoader,
  postNotificationSourceByIdLoader,
  reactionNotificationSourceByIdLoader,
} from './loader/source';
import type { OperationalNotificationData } from '@kosmo/core/db';
import type { UserContext } from '@/context';

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

type NotificationSourceMetadata = {
  postId?: string | null;
  profileId: string;
};

export const getNotificationSourceMetadata = async (
  notification: NotificationRow,
  ctx: UserContext,
): Promise<NotificationSourceMetadata | null> =>
  match(notification.kind)
    .with(NotificationKind.FOLLOW, async () => {
      const source = await followNotificationSourceByIdLoader(ctx).load(notification.sourceId);
      return source ? { profileId: source.followerProfileId } : null;
    })
    .with(NotificationKind.FOLLOW_REQUEST, async () => {
      const source = await followRequestNotificationSourceByIdLoader(ctx).load(
        notification.sourceId,
      );
      return source ? { profileId: source.followerProfileId } : null;
    })
    .with(NotificationKind.REACTION, async () => {
      const source = await reactionNotificationSourceByIdLoader(ctx).load(notification.sourceId);
      return source
        ? {
            postId: source.postId,
            profileId: source.profileId,
          }
        : null;
    })
    .with(NotificationKind.QUOTE, NotificationKind.MENTION, NotificationKind.REPLY, async () => {
      const source = await postNotificationSourceByIdLoader(ctx).load(notification.sourceId);
      return source ? { profileId: source.profileId } : null;
    })
    .with(NotificationKind.REPOST, async () => {
      const source = await postNotificationSourceByIdLoader(ctx).load(notification.sourceId);
      return source ? { postId: source.repostSourceId, profileId: source.profileId } : null;
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
        (await Reaction.getDataloader(ctx).load(notification.sourceId))?.type ?? null,
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
