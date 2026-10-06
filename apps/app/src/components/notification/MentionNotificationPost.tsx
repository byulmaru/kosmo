import { graphql, useFragment } from 'react-relay';
import { PostNotificationPost } from './PostNotificationPost';
import type { MentionNotificationPost_post$key } from './__generated__/MentionNotificationPost_post.graphql';

const MentionNotificationPostFragment = graphql`
  fragment MentionNotificationPost_post on Post {
    ...PostNotificationPost_post
  }
`;

/** Recipient-relative Mention presentation, composed inside NotificationListItemView. */
export function MentionNotificationPost({
  onActivate,
  post: postKey,
}: {
  onActivate?: () => void;
  post: MentionNotificationPost_post$key;
}) {
  const post = useFragment(MentionNotificationPostFragment, postKey);
  return <PostNotificationPost kind="mention" onActivate={onActivate} post={post} />;
}
