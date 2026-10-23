import { builder } from '@/graphql/builder';
import { ReactionNotificationGroup } from './group-ref';
import {
  FollowNotification,
  FollowRequestNotification,
  MentionNotification,
  notificationNodeType,
  OperationalNotification,
  QuoteNotification,
  ReactionNotification,
  ReplyNotification,
  RepostNotification,
} from './ref';
import type { NotificationRow } from './ref';

export const NotificationFeedItem = builder.unionType('NotificationFeedItem', {
  types: [
    FollowNotification,
    FollowRequestNotification,
    MentionNotification,
    OperationalNotification,
    QuoteNotification,
    ReactionNotification,
    ReplyNotification,
    RepostNotification,
    ReactionNotificationGroup,
  ],
  resolveType: (item) =>
    '__typename' in item && item.__typename === 'ReactionNotificationGroup'
      ? 'ReactionNotificationGroup'
      : notificationNodeType((item as NotificationRow).kind),
});

export const NotificationFeedConnection = builder.connectionObject(
  {
    type: NotificationFeedItem,
    name: 'NotificationFeedConnection',
  },
  {
    name: 'NotificationFeedConnectionEdge',
  },
);
