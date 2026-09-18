import { graphql, useFragment } from 'react-relay';
import { PostNotificationPost } from './PostNotificationPost';
import type { ReplyNotificationPost_post$key } from './__generated__/ReplyNotificationPost_post.graphql';

const ReplyNotificationPostFragment = graphql`
  fragment ReplyNotificationPost_post on Post {
    ...PostNotificationPost_post
  }
`;

/** Recipient-relative Reply presentation, composed inside NotificationListItemView. */
export function ReplyNotificationPost({
  onActivate,
  post: postKey,
}: {
  onActivate?: () => void;
  post: ReplyNotificationPost_post$key;
}) {
  const post = useFragment(ReplyNotificationPostFragment, postKey);
  return <PostNotificationPost kind="reply" onActivate={onActivate} post={post} />;
}
