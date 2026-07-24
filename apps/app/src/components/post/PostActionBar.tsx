import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2 } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { formatPostActionCount } from './postActionCount';
import type { ComponentType } from 'react';
import type { AccessibilityState, StyleProp, ViewStyle } from 'react-native';

type ProcessingState = 'default' | 'pending' | 'disabled';

type SocialActionConfig = {
  accessibilityLabel: string;
  count?: number;
  onPress: () => void;
  processing: ProcessingState;
};

type ReplyActionConfig = SocialActionConfig & { expanded: boolean };
type RepostActionConfig = SocialActionConfig & { hasReposted: boolean };
type ReactionActionConfig = Omit<SocialActionConfig, 'count'> & { hasReacted: boolean };
type BookmarkActionConfig = Omit<SocialActionConfig, 'count'> & { hasBookmarked: boolean };
type MoreActionConfig = { accessibilityLabel: string; onPress: () => void };

export type PostActionBarProps = {
  bookmark?: BookmarkActionConfig;
  more?: MoreActionConfig;
  reaction?: ReactionActionConfig;
  reply?: ReplyActionConfig;
  repost?: RepostActionConfig;
};

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
  expanded?: boolean;
  fillActive?: boolean;
  icon: Icon;
  iconHeight?: number;
  iconSize?: number;
  iconStrokeWidth?: number;
  iconWidth?: number;
  onPress: () => void;
  preserveAspectRatio?: 'none';
  processing?: ProcessingState;
  stateful?: boolean;
  testID: string;
};

export function PostActionBar({ bookmark, more, reaction, reply, repost }: PostActionBarProps) {
  const hasOnlyMore = Boolean(more && !bookmark && !reaction && !reply && !repost);

  return (
    <View
      accessibilityLabel="액션 바"
      accessibilityRole="toolbar"
      style={[styles.root, hasOnlyMore ? styles.moreOnlyRoot : undefined]}
    >
      {reply ? (
        <ActionControl
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
      {repost ? (
        <ActionControl
          accessibilityLabel={repost.accessibilityLabel}
          active={repost.hasReposted}
          count={repost.count}
          icon={Repeat2}
          iconHeight={24}
          iconSize={16}
          iconStrokeWidth={2.7}
          iconWidth={18}
          onPress={repost.onPress}
          preserveAspectRatio="none"
          processing={repost.processing}
          testID="repost"
        />
      ) : null}
      {reaction ? (
        <ActionControl
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
        <ActionControl
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
        <ActionControl
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

function ActionControl({
  accessibilityLabel,
  active = false,
  alignToEnd = false,
  count,
  expanded,
  fillActive = false,
  icon: Icon,
  iconHeight,
  iconSize = 16,
  iconStrokeWidth = 3.5,
  iconWidth,
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
    ...(expanded === undefined ? { selected: active } : { expanded }),
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
      aria-expanded={stateful ? expanded : undefined}
      aria-busy={stateful && isPending ? true : undefined}
      aria-pressed={stateful && expanded === undefined ? active : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={stateful ? accessibilityState : undefined}
      disabled={blocked}
      onPress={onPress}
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
  moreOnlyRoot: { justifyContent: 'flex-end' },
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    width: '100%',
  } satisfies StyleProp<ViewStyle>,
});
