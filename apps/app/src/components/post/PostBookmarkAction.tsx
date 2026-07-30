import { useCallback, useEffect, useRef } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { useToast } from '@/components/ui/ToastProvider';
import type { PostBookmarkAction_post$key } from './__generated__/PostBookmarkAction_post.graphql';
import type { PostBookmarkActionCreateBookmarkMutation } from './__generated__/PostBookmarkActionCreateBookmarkMutation.graphql';
import type { PostBookmarkActionDeleteBookmarkMutation } from './__generated__/PostBookmarkActionDeleteBookmarkMutation.graphql';
import type { PostActionExecution, PostActionResolutionReason } from './postActionAvailability';
import type { PostActionProcessingState } from './PostActionControl';

export type BookmarkActionKind = 'create' | 'cancel';

export type BookmarkActionFailure = Readonly<{
  action: BookmarkActionKind;
  error: Error;
}>;

export type BookmarkActionConfig = Readonly<{
  accessibilityLabel: string;
  hasBookmarked: boolean;
  onPress: () => void;
  processing: PostActionProcessingState;
}>;

const postBookmarkActionFragment = graphql`
  fragment PostBookmarkAction_post on Post {
    id
    viewerBookmark {
      id
    }
  }
`;

const createBookmarkMutation = graphql`
  mutation PostBookmarkActionCreateBookmarkMutation($input: CreateBookmarkInput!) {
    createBookmark(input: $input) {
      bookmark {
        id
        post {
          id
          ...PostBookmarkAction_post
        }
      }
    }
  }
`;

const deleteBookmarkMutation = graphql`
  mutation PostBookmarkActionDeleteBookmarkMutation($input: DeleteBookmarkInput!) {
    deleteBookmark(input: $input) {
      bookmarkId
      post {
        id
        ...PostBookmarkAction_post
      }
    }
  }
`;

export function usePostBookmarkAction(
  post: PostBookmarkAction_post$key | null,
  execution: PostActionExecution = { kind: 'enabled' },
  onResolutionRequired?: (reason: PostActionResolutionReason) => void,
  onError?: (failure: BookmarkActionFailure) => void,
): BookmarkActionConfig | undefined {
  const data = useFragment(postBookmarkActionFragment, post);
  const environment = useRelayEnvironment();
  const [commitCreate, isCreating] =
    useMutation<PostBookmarkActionCreateBookmarkMutation>(createBookmarkMutation);
  const [commitDelete, isDeleting] =
    useMutation<PostBookmarkActionDeleteBookmarkMutation>(deleteBookmarkMutation);
  const inFlight = useRef(false);
  const currentEnvironment = useRef(environment);
  const processing = isCreating || isDeleting;

  currentEnvironment.current = environment;

  useEffect(() => {
    inFlight.current = false;
  }, [environment]);

  const onPress = useCallback(() => {
    if (!data || inFlight.current || processing) {
      return;
    }
    if (execution.kind === 'resolution-required') {
      onResolutionRequired?.(execution.reason);
      return;
    }
    if (execution.kind === 'disabled') {
      return;
    }

    const activeBookmarkId = data.viewerBookmark?.id;
    const action: BookmarkActionKind = activeBookmarkId ? 'cancel' : 'create';
    inFlight.current = true;
    const requestEnvironment = environment;
    const finish = () => {
      if (currentEnvironment.current === requestEnvironment) {
        inFlight.current = false;
      }
    };
    const finishWithError = (error: Error) => {
      if (currentEnvironment.current !== requestEnvironment) {
        return;
      }
      inFlight.current = false;
      onError?.({ action, error });
    };
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

    if (activeBookmarkId) {
      commitDelete({ ...callbacks, variables: { input: { id: activeBookmarkId } } });
      return;
    }

    commitCreate({ ...callbacks, variables: { input: { postId: data.id } } });
  }, [
    commitCreate,
    commitDelete,
    data,
    environment,
    execution,
    onError,
    onResolutionRequired,
    processing,
  ]);

  if (!data) {
    return undefined;
  }

  return {
    accessibilityLabel: data.viewerBookmark ? '북마크 취소' : '북마크',
    hasBookmarked: Boolean(data.viewerBookmark),
    onPress,
    processing: processing ? 'pending' : execution.kind === 'disabled' ? 'disabled' : 'default',
  };
}

const failureMessages: Record<BookmarkActionKind, string> = {
  create: '북마크하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  cancel: '북마크를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

export function useBookmarkFailureToast() {
  const { showToast } = useToast();
  return useCallback(
    ({ action }: BookmarkActionFailure) => showToast(failureMessages[action]),
    [showToast],
  );
}
