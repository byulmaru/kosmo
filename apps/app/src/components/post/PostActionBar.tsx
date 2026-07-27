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
  height?: number;
  preserveAspectRatio?: 'none';
  size: number;
  strokeWidth?: number;
  width?: number;
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
  iconHeight?: number;
  iconSize?: number;
  iconStrokeWidth?: number;
  iconWidth?: number;
  menuExpanded?: boolean;
  onPress: () => void;
  preserveAspectRatio?: 'none';
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
          iconHeight={16}
          iconSize={16}
          onPress={reply.onPress}
          preserveAspectRatio="none"
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
          iconSize={18}
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
      items={[{ key: action, label, onSelect: () => runMutation(action) }]}
      renderTrigger={({ expanded: menuExpanded, onPress, ref }) => (
        <PostActionControl
          accessibilityLabel={data.viewerRepost ? '재게시 취소' : '재게시'}
          active={Boolean(data.viewerRepost)}
          controlRef={ref}
          count={data.repostCount}
          hasMenuPopup
          icon={Repeat2}
          iconHeight={24}
          iconSize={16}
          iconStrokeWidth={2.7}
          iconWidth={18}
          menuExpanded={menuExpanded}
          onPress={onPress}
          preserveAspectRatio="none"
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
  iconHeight,
  iconSize = 16,
  iconStrokeWidth = 3.5,
  iconWidth,
  menuExpanded,
  onPress,
  preserveAspectRatio,
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
  const resolvedIconHeight = iconHeight ?? iconSize;
  const resolvedIconWidth = iconWidth ?? iconSize;
  const iconSlotStyle = {
    height: Math.max(16, resolvedIconHeight),
    width: Math.max(16, resolvedIconWidth),
  };

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
          style={[styles.icon, iconSlotStyle, styles.pendingSpinner]}
          testID={`post-action-${testID}-spinner`}
        />
      ) : (
        <View
          accessible={false}
          aria-hidden
          style={[styles.icon, iconSlotStyle]}
          testID={`post-action-${testID}-icon`}
        >
          <Icon
            color={color}
            fill={fillActive && active ? color : 'none'}
            height={resolvedIconHeight}
            preserveAspectRatio={preserveAspectRatio}
            size={iconSize}
            strokeWidth={iconStrokeWidth}
            width={resolvedIconWidth}
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
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  alignToEnd: {
    justifyContent: 'flex-end',
    paddingRight: spacing.sm,
  },
  blocked: { opacity: 0.45 },
  count: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontSize: typography.md.fontSize,
    lineHeight: typography.md.fontSize,
    transform: [{ translateY: 2 }],
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
  pendingSpinner: { transform: [{ translateY: 1 }] },
  pressed: { opacity: 0.72 },
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    width: '100%',
  } satisfies StyleProp<ViewStyle>,
});
