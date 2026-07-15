import { graphql, useFragment } from 'react-relay';
import { PostContentRenderer } from './PostContentRenderer';
import type { PostBody_post$key } from './__generated__/PostBody_post.graphql';

const PostBodyFragment = graphql`
  fragment PostBody_post on Post {
    id
    content {
      id
      document
      bodyText
    }
  }
`;

export function PostBody({
  post: postKey,
  size = 'md',
}: {
  post: PostBody_post$key;
  size?: 'md' | 'lg';
}) {
  const post = useFragment(PostBodyFragment, postKey);
  const content = post.content;

  if (!content) {
    return null;
  }

  return (
    <PostContentRenderer bodyText={content.bodyText} document={content.document} size={size} />
  );
}
