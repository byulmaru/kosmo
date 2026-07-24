import { useCallback, useEffect, useRef } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import type { useRepostAction_post$key } from './__generated__/useRepostAction_post.graphql';
import type { useRepostActionDeletePostMutation } from './__generated__/useRepostActionDeletePostMutation.graphql';
import type { useRepostActionRepostPostMutation } from './__generated__/useRepostActionRepostPostMutation.graphql';
import type { PostActionBarProps } from './PostActionBar';

type UseRepostActionOptions = {
  onError?: (error: Error) => void;
};

export type UseRepostActionResult = NonNullable<PostActionBarProps['repost']>;

const repostActionPostFragment = graphql`
  fragment useRepostAction_post on Post {
    id
    repostCount
    viewerRepost {
      id
    }
  }
`;

export const repostPostMutation = graphql`
  mutation useRepostActionRepostPostMutation($sourceId: ID!) {
    repostPost(input: { sourceId: $sourceId }) {
      repost {
        id
        repostSource {
          id
          repostCount
          viewerRepost {
            id
          }
        }
      }
    }
  }
`;

export const deletePostMutation = graphql`
  mutation useRepostActionDeletePostMutation($id: ID!) {
    deletePost(input: { id: $id }) {
      postId
    }
  }
`;

export function useRepostAction(
  post: useRepostAction_post$key,
  { onError }: UseRepostActionOptions = {},
): UseRepostActionResult {
  const data = useFragment(repostActionPostFragment, post);
  const environment = useRelayEnvironment();
  const [commitRepost, isReposting] =
    useMutation<useRepostActionRepostPostMutation>(repostPostMutation);
  const [commitDelete, isDeleting] =
    useMutation<useRepostActionDeletePostMutation>(deletePostMutation);
  const inFlight = useRef(false);
  const processing = isReposting || isDeleting;

  useEffect(() => {
    inFlight.current = false;
  }, [environment]);

  const finishWithError = useCallback(
    (error: Error) => {
      inFlight.current = false;
      onError?.(error);
    },
    [onError],
  );
  const finish = useCallback(() => {
    inFlight.current = false;
  }, []);
  const onPress = useCallback(() => {
    if (inFlight.current || processing) {
      return;
    }

    inFlight.current = true;
    const callbacks = {
      onCompleted: (
        _response: unknown,
        errors: ReadonlyArray<{ message: string }> | null | undefined,
      ) => {
        if (errors?.[0]) {
          finishWithError(new Error(errors[0].message));
          return;
        }
        finish();
      },
      onError: finishWithError,
    };

    if (data.viewerRepost) {
      commitDelete({ ...callbacks, variables: { id: data.viewerRepost.id } });
      return;
    }

    commitRepost({ ...callbacks, variables: { sourceId: data.id } });
  }, [commitDelete, commitRepost, data.id, data.viewerRepost, finish, finishWithError, processing]);

  return {
    accessibilityLabel: data.viewerRepost ? '재게시 취소' : '재게시',
    count: data.repostCount,
    hasReposted: Boolean(data.viewerRepost),
    onPress,
    processing: processing ? 'pending' : 'default',
  };
}
