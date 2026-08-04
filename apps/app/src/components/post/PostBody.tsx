import { graphql, useFragment } from 'react-relay';
import { PostContentRenderer } from './PostContentRenderer';
import type { PostBody_post$key } from './__generated__/PostBody_post.graphql';
import type { PostMediaOpenHandler } from './PostMediaImage';

const PostBodyFragment = graphql`
  fragment PostBody_post on Post {
    id
    content {
      id
      document
      bodyText
      media {
        id
        altText
        url
      }
    }
  }
`;

export function PostBody({
  interactive = true,
  post: postKey,
  onBodyPress,
  onMediaOpen,
  onMediaUnavailable,
  size = 'md',
}: {
  interactive?: boolean;
  post: PostBody_post$key;
  onBodyPress?: () => void;
  onMediaOpen?: PostMediaOpenHandler;
  onMediaUnavailable?: () => void;
  size?: 'md' | 'lg';
}) {
  const post = useFragment(PostBodyFragment, postKey);
  const content = post.content;

  if (!content) {
    return null;
  }

  return (
    <PostContentRenderer
      bodyText={content.bodyText}
      document={content.document}
      interactive={interactive}
      media={
        content.media?.map(({ altText, id, url }) => ({
          altText: altText ?? null,
          id,
          url: url ?? null,
        })) ?? null
      }
      onBodyPress={onBodyPress}
      onMediaOpen={onMediaOpen}
      onMediaUnavailable={onMediaUnavailable}
      size={size}
    />
  );
}
