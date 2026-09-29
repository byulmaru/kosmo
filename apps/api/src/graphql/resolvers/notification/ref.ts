import {
  db,
  Notifications,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  Reactions,
} from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { match } from 'ts-pattern';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import {
  NotificationRepostRelatedPosts,
  NotificationSourceReposts,
  visibleNotificationWhere,
} from './access/visibility';
import type { UserContext } from '@/context';

export type NotificationRow = typeof Notifications.$inferSelect & {
  /**
   * Follow Request source captured by the same statement as the visible
   * Notification row. It is present on connection/Node rows and lets fields
   * resolve the source from a consistent snapshot instead of issuing a second
   * query after visibility has been checked.
   */
  followRequestSource?: FollowRequestNotificationSourceRow | null;
};
export type FollowNotificationRow = NotificationRow;
export type FollowRequestNotificationRow = NotificationRow;
export type ReactionNotificationRow = NotificationRow;
export type RepostNotificationRow = NotificationRow;
export type ReplyNotificationRow = NotificationRow;
export type QuoteNotificationRow = NotificationRow;

type NotificationSource = {
  followRequest?: typeof ProfileFollowRequests.$inferSelect;
  post?: typeof Posts.$inferSelect;
  profileId: string;
  type?: string;
};

type FollowNotificationSourceRow = {
  id: string;
  profileId: string;
};

type FollowRequestNotificationSourceRow = {
  followRequest: typeof ProfileFollowRequests.$inferSelect;
  id: string;
  profileId: string;
};

export const notificationRowSelection = {
  ...getColumns(Notifications),
  followRequestSourceId: ProfileFollowRequests.id,
  followRequestSourceFollowerProfileId: ProfileFollowRequests.followerProfileId,
  followRequestSourceFolloweeProfileId: ProfileFollowRequests.followeeProfileId,
  followRequestSourceCreatedAt: ProfileFollowRequests.createdAt,
};

type NotificationRowSelection = typeof Notifications.$inferSelect & {
  followRequestSourceId: string | null;
  followRequestSourceFollowerProfileId: string | null;
  followRequestSourceFolloweeProfileId: string | null;
  followRequestSourceCreatedAt: Temporal.Instant | null;
};

export const notificationRowFromSelection = (row: NotificationRowSelection): NotificationRow => {
  const {
    followRequestSourceId,
    followRequestSourceFollowerProfileId,
    followRequestSourceFolloweeProfileId,
    followRequestSourceCreatedAt,
    ...notification
  } = row;

  return {
    ...notification,
    followRequestSource:
      followRequestSourceId === null
        ? null
        : {
            followRequest: {
              id: followRequestSourceId,
              followerProfileId: followRequestSourceFollowerProfileId!,
              followeeProfileId: followRequestSourceFolloweeProfileId!,
              createdAt: followRequestSourceCreatedAt!,
            },
            id: followRequestSourceId,
            profileId: followRequestSourceFollowerProfileId!,
          },
  };
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

type ReplyNotificationSourceRow = {
  id: string;
  post: typeof Posts.$inferSelect;
  profileId: string;
};

type QuoteNotificationSourceRow = {
  id: string;
  profileId: string;
};

const ReplyNotificationParents = alias(Posts, 'reply_notification_parent');
const QuoteNotificationSources = alias(Posts, 'quote_notification_source');

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

const followRequestNotificationSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, FollowRequestNotificationSourceRow, string, true>({
    name: 'notification.followRequestSource',
    nullable: true,
    load: (ids) =>
      db
        .select({
          followRequest: getColumns(ProfileFollowRequests),
          id: ProfileFollowRequests.id,
          profileId: ProfileFollowRequests.followerProfileId,
        })
        .from(ProfileFollowRequests)
        .where(inArray(ProfileFollowRequests.id, ids)),
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

const replyNotificationSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, ReplyNotificationSourceRow, string, true>({
    name: 'notification.replySource',
    nullable: true,
    load: (ids) =>
      db
        .select({
          id: Posts.id,
          post: getColumns(Posts),
          profileId: Posts.profileId,
        })
        .from(Posts)
        .innerJoin(ReplyNotificationParents, eq(ReplyNotificationParents.id, Posts.replyParentId))
        .innerJoin(
          Notifications,
          and(
            eq(Notifications.kind, NotificationKind.REPLY),
            eq(Notifications.sourceId, Posts.id),
            eq(Notifications.recipientProfileId, ReplyNotificationParents.profileId),
          ),
        )
        .where(inArray(Posts.id, ids)),
    key: (source) => source?.id ?? null,
  });

const quoteNotificationSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, QuoteNotificationSourceRow, string, true>({
    name: 'notification.quoteSource',
    nullable: true,
    load: (ids) =>
      db
        .select({
          id: Posts.id,
          profileId: Posts.profileId,
        })
        .from(Posts)
        .innerJoin(QuoteNotificationSources, eq(QuoteNotificationSources.id, Posts.repostSourceId))
        .innerJoin(
          Notifications,
          and(
            eq(Notifications.kind, NotificationKind.QUOTE),
            eq(Notifications.sourceId, Posts.id),
            eq(Notifications.recipientProfileId, QuoteNotificationSources.profileId),
            visibleNotificationWhere({ ctx }),
          ),
        )
        .where(inArray(Posts.id, ids)),
    key: (source) => source?.id ?? null,
  });

export const getNotificationSource = async (
  notification: NotificationRow,
  ctx: UserContext,
): Promise<NotificationSource> => {
  const source = await match(notification.kind)
    .with(NotificationKind.FOLLOW, () =>
      followNotificationSourceLoader(ctx).load(notification.sourceId),
    )
    .with(NotificationKind.FOLLOW_REQUEST, () =>
      'followRequestSource' in notification
        ? notification.followRequestSource
        : followRequestNotificationSourceLoader(ctx).load(notification.sourceId),
    )
    .with(NotificationKind.REACTION, () =>
      reactionNotificationSourceLoader(ctx).load(notification.sourceId),
    )
    .with(NotificationKind.QUOTE, () =>
      quoteNotificationSourceLoader(ctx).load(notification.sourceId),
    )
    .with(NotificationKind.REPLY, () =>
      replyNotificationSourceLoader(ctx).load(notification.sourceId),
    )
    .otherwise(() => repostNotificationSourceLoader(ctx).load(notification.sourceId));

  if (!source) {
    throw new Error('Notification source not found');
  }

  return source;
};

export const notificationNodeType = (kind: string) =>
  match(kind)
    .with(NotificationKind.FOLLOW, () => 'FollowNotification' as const)
    .with(NotificationKind.FOLLOW_REQUEST, () => 'FollowRequestNotification' as const)
    .with(NotificationKind.REACTION, () => 'ReactionNotification' as const)
    .with(NotificationKind.REPOST, () => 'RepostNotification' as const)
    .with(NotificationKind.QUOTE, () => 'QuoteNotification' as const)
    .with(NotificationKind.REPLY, () => 'ReplyNotification' as const)
    .otherwise(() => null);

export const notificationKindForNodeType = (typename: string) =>
  match(typename)
    .with('FollowNotification', () => NotificationKind.FOLLOW)
    .with('FollowRequestNotification', () => NotificationKind.FOLLOW_REQUEST)
    .with('ReactionNotification', () => NotificationKind.REACTION)
    .with('RepostNotification', () => NotificationKind.REPOST)
    .with('QuoteNotification', () => NotificationKind.QUOTE)
    .with('ReplyNotification', () => NotificationKind.REPLY)
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
      .select(notificationRowSelection)
      .from(Notifications)
      .leftJoin(
        ProfileFollowRequests,
        and(
          eq(ProfileFollowRequests.id, Notifications.sourceId),
          eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
        ),
      )
      .where(
        and(
          inArray(Notifications.id, ids),
          eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
          visibleNotificationWhere({ ctx }),
        ),
      )
      .then((rows) => rows.map(notificationRowFromSelection)),
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
