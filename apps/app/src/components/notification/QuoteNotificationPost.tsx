import { graphql, useFragment } from 'react-relay';
import { PostNotificationPost } from './PostNotificationPost';
import type { QuoteNotificationPost_post$key } from './__generated__/QuoteNotificationPost_post.graphql';

const QuoteNotificationPostFragment = graphql`
  fragment QuoteNotificationPost_post on Post {
    ...PostNotificationPost_post
  }
`;

/** Presentation-only Quote surface until the concrete QuoteNotification API is available. */
export function QuoteNotificationPost({
  onActivate,
  post: postKey,
}: {
  onActivate?: () => void;
  post: QuoteNotificationPost_post$key;
}) {
  const post = useFragment(QuoteNotificationPostFragment, postKey);
  return <PostNotificationPost kind="quote" onActivate={onActivate} post={post} />;
}
