import { Quote, Repeat2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { PostActionControl } from './PostActionControl';
import type { RepostAction_post$key } from './__generated__/RepostAction_post.graphql';
import type { RepostActionDeletePostMutation } from './__generated__/RepostActionDeletePostMutation.graphql';
import type { RepostActionRepostPostMutation } from './__generated__/RepostActionRepostPostMutation.graphql';
import type { PostActionExecution, PostActionResolutionReason } from './postActionAvailability';

export type RepostActionKind = 'create' | 'cancel';

export type RepostActionFailure = Readonly<{
  action: RepostActionKind;
  error: Error;
}>;

type Props = {
  execution?: PostActionExecution;
  onError?: (failure: RepostActionFailure) => void;
  onQuote?: (restoreFocus: () => void) => void;
  onResolutionRequired?: (reason: PostActionResolutionReason) => void;
  post: RepostAction_post$key;
};

const repostActionPostFragment = graphql`
  fragment RepostAction_post on Post {
    content {
      id
    }
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
      postId @deleteRecord
      repostSource {
        id
        repostCount
        viewerRepost {
          id
        }
      }
    }
  }
`;

export function RepostAction({
  execution = { kind: 'enabled' },
  onError,
  onQuote,
  onResolutionRequired,
  post,
}: Props) {
  const theme = useTheme();
  const data = useFragment(repostActionPostFragment, post);
  const environment = useRelayEnvironment();
  const { accountId } = useSession();
  const [commitRepost, isReposting] =
    useMutation<RepostActionRepostPostMutation>(repostPostMutation);
  const [commitDelete, isDeleting] =
    useMutation<RepostActionDeletePostMutation>(deletePostMutation);
  const inFlight = useRef(false);
  const currentEnvironment = useRef(environment);
  const currentAccountId = useRef(accountId);
  const restoreFocusRef = useRef<() => void>(() => undefined);
  const processing = isReposting || isDeleting;

  currentEnvironment.current = environment;
  currentAccountId.current = accountId;

  useEffect(() => {
    inFlight.current = false;
  }, [environment]);

  const runMutation = useCallback(
    (action: RepostActionKind) => {
      if (execution.kind !== 'enabled' || inFlight.current || processing) {
        return;
      }

      const activeRepostId = data.viewerRepost?.id;
      if (action === 'cancel' && !activeRepostId) {
        return;
      }

      inFlight.current = true;
      const requestEnvironment = environment;
      const requestAccountId = accountId;
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
          response: unknown,
          errors: ReadonlyArray<{ message: string }> | null | undefined,
        ) => {
          if (errors?.[0]) {
            finishWithError(new Error(errors[0].message));
            return;
          }

          const mutationConfirmed =
            action === 'create'
              ? Boolean(
                  (response as RepostActionRepostPostMutation['response'] | null)?.repostPost
                    ?.repost?.id,
                )
              : (response as RepostActionDeletePostMutation['response'] | null)?.deletePost
                  ?.postId === activeRepostId;
          if (
            mutationConfirmed &&
            requestAccountId &&
            currentAccountId.current === requestAccountId
          ) {
            trackAnalytics('repost_succeeded', {
              result: action === 'create' ? 'created' : 'removed',
            });
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
    [
      commitDelete,
      commitRepost,
      data.id,
      data.viewerRepost?.id,
      environment,
      execution.kind,
      accountId,
      onError,
      processing,
    ],
  );

  const action: RepostActionKind = data.viewerRepost ? 'cancel' : 'create';
  const label = action === 'cancel' ? '재게시 취소' : '재게시하기';
  const items = [
    { icon: Repeat2, key: action, label, onSelect: () => runMutation(action) },
    ...(data.content && onQuote
      ? [
          {
            icon: Quote,
            key: 'quote',
            label: '인용하기',
            onSelect: () => onQuote(restoreFocusRef.current),
          },
        ]
      : []),
  ];

  return (
    <ActionMenu
      accessibilityLabel="재게시 메뉴"
      disabled={processing || execution.kind !== 'enabled'}
      items={items}
      renderTrigger={({ expanded: menuExpanded, focusTrigger, onPress, ref }) => {
        restoreFocusRef.current = focusTrigger;
        const triggerPress =
          execution.kind === 'resolution-required'
            ? () => onResolutionRequired?.(execution.reason)
            : onPress;
        return (
          <PostActionControl
            accessibilityLabel={data.viewerRepost ? '재게시 취소' : '재게시'}
            active={Boolean(data.viewerRepost)}
            activeColor={theme.actionRepostBase}
            controlRef={ref}
            count={data.repostCount}
            hoverColor={theme.actionRepostBase}
            hoverDisabled={execution.kind === 'resolution-required'}
            hoverForegroundColor={theme.actionRepostBase}
            icon={Repeat2}
            iconStrokeWidth={2.7}
            menuExpanded={execution.kind === 'enabled' ? menuExpanded : false}
            onPress={triggerPress}
            popupRole="menu"
            processing={
              processing ? 'pending' : execution.kind === 'disabled' ? 'disabled' : 'default'
            }
            testID="repost"
          />
        );
      }}
    />
  );
}
