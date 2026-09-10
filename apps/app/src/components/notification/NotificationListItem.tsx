import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { useCallback } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { formatTimelineTimestamp } from '@/lib/date';
import { NotificationListItemView } from './NotificationListItemView';
import { ReplyNotificationPost } from './ReplyNotificationPost';
import type { PostMediaItem } from '@/components/post/PostMediaImage';
import type { FollowRequestNotificationListItem_notification$key } from './__generated__/FollowRequestNotificationListItem_notification.graphql';
import type { NotificationListItem_notification$key } from './__generated__/NotificationListItem_notification.graphql';
import type { NotificationListItemMarkReadMutation } from './__generated__/NotificationListItemMarkReadMutation.graphql';
import type { ReactionNotificationListItem_notification$key } from './__generated__/ReactionNotificationListItem_notification.graphql';
import type { ReplyNotificationListItem_notification$key } from './__generated__/ReplyNotificationListItem_notification.graphql';
import type { RepostNotificationListItem_notification$key } from './__generated__/RepostNotificationListItem_notification.graphql';

type NotificationListItemProps = {
  notification: NotificationListItem_notification$key;
};

const notificationFragment = graphql`
  fragment NotificationListItem_notification on FollowNotification {
    id
    createdAt
    readAt
    profile {
      id
      displayName
      handle
      relativeHandle
      avatar {
        id
        url
      }
    }
  }
`;

const notificationListItemMarkReadMutation = graphql`
  mutation NotificationListItemMarkReadMutation($ids: [ID!]!) {
    markNotificationRead(input: { ids: $ids }) {
      notifications {
        id
        readAt
      }
      recipientProfiles {
        id
        unreadNotificationCount
      }
    }
  }
`;

function useNotificationRead() {
  const [commitMarkRead] = useMutation<NotificationListItemMarkReadMutation>(
    notificationListItemMarkReadMutation,
  );
  return useCallback(
    (id: string) => {
      commitMarkRead({
        onError: () => undefined,
        variables: { ids: [id] },
      });
    },
    [commitMarkRead],
  );
}

function actor(profile: {
  avatar?: { url: string | null | undefined } | null;
  displayName: string;
  handle: string;
  id: string;
}) {
  return {
    avatarUrl: profile.avatar?.url,
    id: profile.id,
    name: profile.displayName || profile.handle,
  };
}

export function NotificationListItem({ notification }: NotificationListItemProps) {
  const data = useFragment(notificationFragment, notification);
  const markRead = useNotificationRead();

  return (
    <NotificationListItemView
      actors={[actor(data.profile)]}
      href={`/${data.profile.relativeHandle}`}
      kind="follow"
      onNavigate={() => markRead(data.id)}
      timestamp={formatTimelineTimestamp(data.createdAt)}
      unread={data.readAt === null}
    />
  );
}

const followRequestNotificationFragment = graphql`
  fragment FollowRequestNotificationListItem_notification on FollowRequestNotification {
    id
    createdAt
    readAt
    profile {
      id
      displayName
      handle
      relativeHandle
      avatar {
        id
        url
      }
    }
  }
`;

export function FollowRequestNotificationListItem({
  notification,
}: {
  notification: FollowRequestNotificationListItem_notification$key;
}) {
  const data = useFragment(followRequestNotificationFragment, notification);
  const markRead = useNotificationRead();

  return (
    <NotificationListItemView
      actors={[actor(data.profile)]}
      href="/follow-requests"
      kind="followRequest"
      onNavigate={() => markRead(data.id)}
      timestamp={formatTimelineTimestamp(data.createdAt)}
      unread={data.readAt === null}
    />
  );
}

const reactionNotificationFragment = graphql`
  fragment ReactionNotificationListItem_notification on ReactionNotification {
    id
    createdAt
    readAt
    profile {
      id
      displayName
      handle
      avatar {
        id
        url
      }
    }
    post {
      id
      profile {
        relativeHandle
      }
      content {
        bodyText
        contentWarning
        document
        media {
          id
          altText
          url
        }
      }
    }
  }
`;

export function ReactionNotificationListItem({
  notification,
}: {
  notification: ReactionNotificationListItem_notification$key;
}) {
  const data = useFragment(reactionNotificationFragment, notification);
  const markRead = useNotificationRead();

  return (
    <NotificationListItemView
      actors={[actor(data.profile)]}
      href={`/${data.post.profile.relativeHandle}/${data.post.id}`}
      kind="reaction"
      onNavigate={() => markRead(data.id)}
      preview={toPreview(data.post)}
      timestamp={formatTimelineTimestamp(data.createdAt)}
      unread={data.readAt === null}
    />
  );
}

const replyNotificationFragment = graphql`
  fragment ReplyNotificationListItem_notification on ReplyNotification {
    id
    readAt
    post {
      ...ReplyNotificationPost_post
    }
  }
`;

export function ReplyNotificationListItem({
  notification,
}: {
  notification: ReplyNotificationListItem_notification$key;
}) {
  const data = useFragment(replyNotificationFragment, notification);
  const markRead = useNotificationRead();

  return (
    <NotificationListItemView kind="reply" unread={data.readAt === null}>
      <ReplyNotificationPost onActivate={() => markRead(data.id)} post={data.post} />
    </NotificationListItemView>
  );
}

const repostNotificationFragment = graphql`
  fragment RepostNotificationListItem_notification on RepostNotification {
    id
    createdAt
    readAt
    profile {
      id
      displayName
      handle
      avatar {
        id
        url
      }
    }
    post {
      id
      profile {
        relativeHandle
      }
      content {
        bodyText
        contentWarning
        document
        media {
          id
          altText
          url
        }
      }
    }
  }
`;

export function RepostNotificationListItem({
  notification,
}: {
  notification: RepostNotificationListItem_notification$key;
}) {
  const data = useFragment(repostNotificationFragment, notification);
  const markRead = useNotificationRead();

  return (
    <NotificationListItemView
      actors={[actor(data.profile)]}
      href={`/${data.post.profile.relativeHandle}/${data.post.id}`}
      kind="repost"
      onNavigate={() => markRead(data.id)}
      preview={toPreview(data.post)}
      timestamp={formatTimelineTimestamp(data.createdAt)}
      unread={data.readAt === null}
    />
  );
}

function toPreview(post: {
  content:
    | {
        bodyText: string;
        contentWarning: string | null | undefined;
        document: unknown;
        media:
          | ReadonlyArray<{
              altText: string | null | undefined;
              id: string;
              url: string | null | undefined;
            }>
          | null
          | undefined;
      }
    | null
    | undefined;
}) {
  const content = post.content;
  if (!content) {
    return null;
  }

  return {
    bodyText: content.bodyText,
    contentWarning: content.contentWarning ?? null,
    media:
      content.media?.map<PostMediaItem>(({ altText, id, url }) => ({
        altText: altText ?? null,
        id,
        url: url ?? null,
      })) ?? null,
    sensitiveMedia: isPostContentDocumentV1(content.document)
      ? content.document.body.attrs?.sensitiveMedia === true
      : false,
  };
}
