import { useRef } from 'react';
import { graphql, useFragment } from 'react-relay';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import type { View } from 'react-native';
import type { PostReplySurface_post$key } from './__generated__/PostReplySurface_post.graphql';
import type { PostActionBarProps } from './PostActionBar';

const PostReplySurfaceFragment = graphql`
  fragment PostReplySurface_post on Post {
    id
    content {
      id
    }
    ...ReplyComposerSurface_parent @alias(as: "replySurface")
  }
`;

/** Share Reply execution and focus lifecycle; each consumer places its own surface. */
export function usePostReplySurface(postKey: PostReplySurface_post$key) {
  const post = useFragment(PostReplySurfaceFragment, postKey);
  const binding = usePostReplyBinding(post.id);
  const authentication = usePostActionAuthentication(Boolean(post.content));
  const triggerRef = useRef<View>(null);
  const reply: PostActionBarProps['reply'] = binding
    ? {
        accessibilityLabel: '답글',
        controlRef: triggerRef,
        expanded: authentication.execution.kind === 'enabled' && binding.expanded,
        onPress: () => {
          if (authentication.execution.kind === 'resolution-required') {
            authentication.resolve(authentication.execution.reason);
          } else if (authentication.execution.kind === 'enabled') {
            binding.onPress();
          }
        },
        processing: getReplyProcessingState(authentication.execution, Boolean(binding.profile)),
      }
    : undefined;
  const replySurface =
    authentication.execution.kind === 'enabled' &&
    binding?.profile &&
    post.content &&
    post.replySurface ? (
      <ReplyComposerSurface
        ref={binding.surfaceRef}
        onPostCreated={binding.onPostCreated}
        onRequestClose={binding.onRequestClose}
        open={binding.expanded}
        owner={binding.owner}
        parent={post.replySurface}
        profile={binding.profile}
        triggerRef={triggerRef}
      />
    ) : null;

  return { reply, replySurface, owner: binding?.owner };
}
