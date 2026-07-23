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

type Icon = ComponentType<{ color: string; fill?: string; size: number }>;

type ActionControlProps = {
  accessibilityLabel: string;
  active?: boolean;
  alignToEnd?: boolean;
  count?: number;
  expanded?: boolean;
  fillActive?: boolean;
  icon: Icon;
  onPress: () => void;
  processing?: ProcessingState;
  stateful?: boolean;
  testID: string;
};

export function PostActionBar({ bookmark, more, reaction, reply, repost }: PostActionBarProps) {
  return (
    <View accessibilityRole="toolbar" style={styles.root}>
      {reply ? (
        <ActionControl
          accessibilityLabel={reply.accessibilityLabel}
          count={reply.count}
          expanded={reply.expanded}
          icon={MessageCircle}
          onPress={reply.onPress}
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
          onPress={repost.onPress}
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
    ...(expanded === undefined ? { selected: active } : { expanded }),
  };
  const formattedCount = formatPostActionCount(count);

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
          <Icon color={color} fill={fillActive && active ? color : 'none'} size={16} />
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
  },
  icon: { height: 16, width: 16 },
  pressed: { opacity: 0.72 },
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    width: '100%',
  } satisfies StyleProp<ViewStyle>,
});
