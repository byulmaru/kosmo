import { graphql, useFragment } from 'react-relay';
import { PostContentRenderer } from './PostContentRenderer';
import type { PostBody_post$key } from './__generated__/PostBody_post.graphql';
import type { PostContentWarningPresentation } from './PostContentRenderer';
import type { PostMediaOpenHandler } from './PostMediaImage';

const PostBodyFragment = graphql`
  fragment PostBody_post on Post {
    id
    content {
      id
      document
      bodyText
      contentWarning
      media {
        id
        altText
        url
      }
    }
  }
`;

export function PostBody({
  contentWarningPresentation = 'default',
  interactive = true,
  mediaPresentation = 'default',
  numberOfLines,
  post: postKey,
  onBodyPress,
  onMediaOpen,
  size = 'md',
}: {
  contentWarningPresentation?: PostContentWarningPresentation;
  interactive?: boolean;
  mediaPresentation?: 'default' | 'hidden';
  numberOfLines?: number;
  post: PostBody_post$key;
  onBodyPress?: () => void;
  onMediaOpen?: PostMediaOpenHandler;
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
      contentWarning={content.contentWarning}
      contentWarningPresentation={contentWarningPresentation}
      document={content.document}
      interactive={interactive}
      media={
        mediaPresentation === 'hidden'
          ? null
          : (content.media?.map(({ altText, id, url }) => ({
              altText: altText ?? null,
              id,
              url: url ?? null,
            })) ?? null)
      }
      mediaPresentation={mediaPresentation}
      numberOfLines={numberOfLines}
      onBodyPress={onBodyPress}
      onMediaOpen={mediaPresentation === 'hidden' ? undefined : onMediaOpen}
      postId={post.id}
      size={size}
    />
  );
}
