import { useMemo } from 'react';
import { graphql, useSubscription } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import type { NotificationStreamSubscription } from './__generated__/NotificationStreamSubscription.graphql';

const notificationStreamSubscription = graphql`
  subscription NotificationStreamSubscription($connections: [ID!]!) {
    notifications {
      __typename
      ... on NotificationAdded {
        notification
          @prependNode(connections: $connections, edgeTypeName: "NotificationConnectionEdge") {
          id
          __typename
          ... on FollowNotification {
            ...NotificationListItem_notification @alias(as: "follow")
          }
          ... on FollowRequestNotification {
            ...FollowRequestNotificationListItem_notification @alias(as: "followRequest")
          }
          ... on MentionNotification {
            ...MentionNotificationListItem_notification @alias(as: "mention")
          }
          ... on ReactionNotification {
            ...ReactionNotificationListItem_notification @alias(as: "reaction")
          }
          ... on ReplyNotification {
            ...ReplyNotificationListItem_notification @alias(as: "reply")
          }
          ... on RepostNotification {
            ...RepostNotificationListItem_notification @alias(as: "repost")
          }
          ... on QuoteNotification {
            ...QuoteNotificationListItem_notification @alias(as: "quote")
          }
          ... on OperationalNotification {
            ...OperationalNotificationListItem_notification @alias(as: "operational")
          }
        }
        profile {
          id
          unreadNotificationCount
        }
      }
    }
  }
`;

export function NotificationStreamUpdates({ profileId }: { profileId: string }) {
  const config = useMemo(
    () => ({
      subscription: notificationStreamSubscription,
      variables: {
        connections: [
          ConnectionHandler.getConnectionID(profileId, 'NotificationList_notifications'),
        ],
      },
    }),
    [profileId],
  );

  useSubscription<NotificationStreamSubscription>(config);

  return null;
}
