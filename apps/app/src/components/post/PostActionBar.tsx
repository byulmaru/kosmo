import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { formatPostActionCount } from './postActionCount';
import type { ComponentType, Ref } from 'react';
import type { AccessibilityState, StyleProp, ViewStyle } from 'react-native';
import type { PostActionBar_post$key } from './__generated__/PostActionBar_post.graphql';
import type { RepostAction_post$key } from './__generated__/RepostAction_post.graphql';
import type { RepostActionDeletePostMutation } from './__generated__/RepostActionDeletePostMutation.graphql';
import type { RepostActionRepostPostMutation } from './__generated__/RepostActionRepostPostMutation.graphql';

type ProcessingState = 'default' | 'pending' | 'disabled';

type SocialActionConfig = {
  accessibilityLabel: string;
  count?: number;
  onPress: () => void;
  processing: ProcessingState;
};

type ReplyActionConfig = SocialActionConfig & { expanded: boolean };
type ReactionActionConfig = Omit<SocialActionConfig, 'count'> & { hasReacted: boolean };
type BookmarkActionConfig = Omit<SocialActionConfig, 'count'> & { hasBookmarked: boolean };
type MoreActionConfig = { accessibilityLabel: string; onPress: () => void };

export type PostActionBarProps = {
  bookmark?: BookmarkActionConfig;
  more?: MoreActionConfig;
  onRepostError?: (failure: RepostActionFailure) => void;
  post?: PostActionBar_post$key | null;
  reaction?: ReactionActionConfig;
  reply?: ReplyActionConfig;
};

export type RepostActionKind = 'create' | 'cancel';

export type RepostActionFailure = Readonly<{
  action: RepostActionKind;
  error: Error;
}>;

const postActionBarPostFragment = graphql`
  fragment PostActionBar_post on Post {
    ...RepostAction_post @alias(as: "repost")
  }
`;

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

type Icon = ComponentType<{
  color: string;
  fill?: string;
  size: number;
  strokeWidth?: number;
}>;

type ActionControlProps = {
  accessibilityLabel: string;
  active?: boolean;
  alignToEnd?: boolean;
  count?: number;
  controlRef?: Ref<View>;
  expanded?: boolean;
  fillActive?: boolean;
  hasMenuPopup?: boolean;
  icon: Icon;
  iconStrokeWidth?: number;
  menuExpanded?: boolean;
  onPress: () => void;
  processing?: ProcessingState;
  stateful?: boolean;
  testID: string;
};

export function PostActionBar({
  bookmark,
  more,
  onRepostError,
  post,
  reaction,
  reply,
}: PostActionBarProps) {
  const data = useFragment(postActionBarPostFragment, post ?? null);

  return (
    <View accessibilityLabel="액션 바" accessibilityRole="toolbar" style={styles.root}>
      {reply ? (
        <PostActionControl
          accessibilityLabel={reply.accessibilityLabel}
          count={reply.count}
          expanded={reply.expanded}
          icon={MessageCircle}
          onPress={reply.onPress}
          processing={reply.processing}
          testID="reply"
        />
      ) : null}
      {data?.repost ? <RepostAction onError={onRepostError} post={data.repost} /> : null}
      {reaction ? (
        <PostActionControl
          accessibilityLabel={reaction.accessibilityLabel}
          active={reaction.hasReacted}
          fillActive
          icon={Heart}
          onPress={reaction.onPress}
          processing={reaction.processing}
          testID="reaction"
        />
      ) : null}
      {bookmark ? (
        <PostActionControl
          accessibilityLabel={bookmark.accessibilityLabel}
          active={bookmark.hasBookmarked}
          fillActive
          icon={Bookmark}
          onPress={bookmark.onPress}
          processing={bookmark.processing}
          testID="bookmark"
        />
      ) : null}
      {more ? (
        <PostActionControl
          accessibilityLabel={more.accessibilityLabel}
          alignToEnd
          icon={MoreHorizontal}
          onPress={more.onPress}
          stateful={false}
          testID="more"
        />
      ) : null}
    </View>
  );
}

type RepostActionProps = {
  onError?: (failure: RepostActionFailure) => void;
  post: RepostAction_post$key;
};

function RepostAction({ onError, post }: RepostActionProps) {
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

function PostActionControl({
  accessibilityLabel,
  active = false,
  alignToEnd = false,
  count,
  controlRef,
  expanded,
  fillActive = false,
  hasMenuPopup = false,
  icon: Icon,
  iconStrokeWidth = 3.5,
  menuExpanded,
  onPress,
  processing = 'default',
  stateful = true,
  testID,
}: ActionControlProps) {
  const theme = useTheme();
  const isPending = processing === 'pending';
  const isDisabled = processing === 'disabled';
  const blocked = isPending || isDisabled;
  const color = blocked
    ? theme.textSecondary
    : active || expanded
      ? theme.primary
      : theme.textSecondary;
  const accessibilityState: AccessibilityState = {
    busy: isPending,
    disabled: blocked,
    ...(hasMenuPopup
      ? { expanded: menuExpanded, selected: active }
      : expanded === undefined
        ? { selected: active }
        : { expanded }),
  };
  const formattedCount = formatPostActionCount(count);

  return (
    <Pressable
      aria-expanded={stateful ? (hasMenuPopup ? menuExpanded : expanded) : undefined}
      aria-busy={stateful && isPending ? true : undefined}
      aria-pressed={stateful && expanded === undefined ? active : undefined}
      aria-haspopup={hasMenuPopup ? 'menu' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={stateful ? accessibilityState : undefined}
      disabled={blocked}
      onPress={onPress}
      ref={controlRef}
      testID={`post-action-${testID}`}
      style={({ pressed }) => [
        styles.action,
        alignToEnd ? styles.alignToEnd : undefined,
        blocked ? styles.blocked : pressed ? styles.pressed : undefined,
      ]}
    >
      {isPending ? (
        <ActivityIndicator
          accessible={false}
          aria-hidden
          color={color}
          size={14}
          style={styles.icon}
          testID={`post-action-${testID}-spinner`}
        />
      ) : (
        <View
          accessible={false}
          aria-hidden
          style={styles.icon}
          testID={`post-action-${testID}-icon`}
        >
          <Icon
            color={color}
            fill={fillActive && active ? color : 'none'}
            size={16}
            strokeWidth={iconStrokeWidth}
          />
        </View>
      )}
      {formattedCount ? (
        <Text numberOfLines={1} style={[styles.count, { color }]}>
          {formattedCount}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    height: 28,
    justifyContent: 'center',
    width: 50,
  },
  alignToEnd: {
    width: 28,
  },
  blocked: { opacity: 0.45 },
  count: {
    flexShrink: 0,
    fontFamily: 'SUIT',
    fontSize: typography.md.fontSize,
    lineHeight: typography.md.fontSize,
  },
  icon: { alignItems: 'center', height: 16, justifyContent: 'center', width: 16 },
  pressed: { opacity: 0.72 },
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    height: 28,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    width: '100%',
  } satisfies StyleProp<ViewStyle>,
});
