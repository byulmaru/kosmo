import { Repeat2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { PostActionControl } from './PostActionControl';
import type { RepostAction_post$key } from './__generated__/RepostAction_post.graphql';
import type { RepostActionDeletePostMutation } from './__generated__/RepostActionDeletePostMutation.graphql';
import type { RepostActionRepostPostMutation } from './__generated__/RepostActionRepostPostMutation.graphql';

export type RepostActionKind = 'create' | 'cancel';

export type RepostActionFailure = Readonly<{
  action: RepostActionKind;
  error: Error;
}>;

type Props = {
  onError?: (failure: RepostActionFailure) => void;
  post: RepostAction_post$key;
};

const repostActionPostFragment = graphql`
  fragment RepostAction_post on Post {
    id
    repostCount
    viewerRepost {
      id
    }
  }
`;

const repostPostMutation = graphql`
  mutation RepostActionRepostPostMutation($sourceId: ID!) {
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

const deletePostMutation = graphql`
  mutation RepostActionDeletePostMutation($id: ID!) {
    deletePost(input: { id: $id }) {
      postId
    }
  }
`;

export function RepostAction({ onError, post }: Props) {
  const data = useFragment(repostActionPostFragment, post);
  const environment = useRelayEnvironment();
  const [commitRepost, isReposting] =
    useMutation<RepostActionRepostPostMutation>(repostPostMutation);
  const [commitDelete, isDeleting] =
    useMutation<RepostActionDeletePostMutation>(deletePostMutation);
  const inFlight = useRef(false);
  const currentEnvironment = useRef(environment);
  const processing = isReposting || isDeleting;

  currentEnvironment.current = environment;

  useEffect(() => {
    inFlight.current = false;
  }, [environment]);

  const runMutation = useCallback(
    (action: RepostActionKind) => {
      if (inFlight.current || processing) {
        return;
      }

      const activeRepostId = data.viewerRepost?.id;
      if (action === 'cancel' && !activeRepostId) {
        return;
      }

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

      if (action === 'cancel') {
        if (!activeRepostId) {
          return;
        }
        commitDelete({ ...callbacks, variables: { id: activeRepostId } });
        return;
      }

      commitRepost({ ...callbacks, variables: { sourceId: data.id } });
    },
    [commitDelete, commitRepost, data.id, data.viewerRepost?.id, environment, onError, processing],
  );

  const action: RepostActionKind = data.viewerRepost ? 'cancel' : 'create';
  const label = action === 'cancel' ? '재게시 취소' : '재게시하기';

  return (
    <ActionMenu
      accessibilityLabel="재게시 메뉴"
      disabled={processing}
      items={[{ icon: Repeat2, key: action, label, onSelect: () => runMutation(action) }]}
      renderTrigger={({ expanded: menuExpanded, onPress, ref }) => (
        <PostActionControl
          accessibilityLabel={data.viewerRepost ? '재게시 취소' : '재게시'}
          active={Boolean(data.viewerRepost)}
          controlRef={ref}
          count={data.repostCount}
          hasMenuPopup
          icon={Repeat2}
          iconStrokeWidth={2.7}
          menuExpanded={menuExpanded}
          onPress={onPress}
          processing={processing ? 'pending' : 'default'}
          testID="repost"
        />
      )}
    />
  );
}
