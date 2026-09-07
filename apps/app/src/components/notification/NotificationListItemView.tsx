import { Link } from 'expo-router';
import { Repeat2, Smile, UserRoundPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PostContentPrivacyBoundary } from '@/components/post/PostContentPrivacyBoundary';
import { PostMediaImage } from '@/components/post/PostMediaImage';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';
import type { PostMediaItem } from '@/components/post/PostMediaImage';

type Actor = { id: string; name: string; avatarUrl?: string | null };

type Preview = {
  bodyText: string;
  contentWarning: string | null;
  media: readonly PostMediaItem[] | null;
  sensitiveMedia: boolean;
};

type ActorSummary = {
  actors: readonly [Actor, ...Actor[]];
  /** Server-owned total; never infer grouping or actor order here. */
  totalActorCount?: number;
  actor?: never;
  children?: never;
};

export type NotificationListItemViewProps = {
  href: Href;
  onNavigate?: () => void;
  timestamp: string;
  unread?: boolean;
  disabled?: boolean;
  pending?: boolean;
} & (
  | (ActorSummary & { kind: 'follow' | 'followRequest'; preview?: never })
  | (ActorSummary & { kind: 'reaction' | 'repost'; preview: Preview | null })
  | {
      kind: 'reply';
      actor: Actor;
      /** Compose the existing PostListItem with showDivider={false}. */
      children: ReactElement;
      actors?: never;
      totalActorCount?: never;
      preview?: never;
    }
);

const actions = {
  follow: '팔로우했습니다',
  followRequest: '팔로우를 요청했습니다',
  reaction: '이 게시글에 반응했습니다',
  repost: '이 게시글을 재게시했습니다',
  reply: '답글을 남겼습니다',
} as const;

/** Presentation only. The consumer owns navigation, Read and pending state. */
export function NotificationListItemView(props: NotificationListItemViewProps) {
  const {
    disabled = false,
    href,
    kind,
    onNavigate,
    pending = false,
    timestamp,
    unread = false,
  } = props;
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const [focusVisible, setFocusVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const blocked = disabled || pending;
  const actors = kind === 'reply' ? [props.actor] : props.actors;
  const actor = actors[0];
  const suppliedCount = props.totalActorCount ?? actors.length;
  const count =
    kind === 'reply'
      ? 1
      : Math.max(
          actors.length,
          Number.isFinite(suppliedCount) ? Math.floor(suppliedCount) : actors.length,
        );
  const otherCount = count - 1;
  const subject = `${actor.name}${otherCount > 0 ? ` 외 ${otherCount}명이` : '님이'}`;
  const destination =
    kind === 'follow' ? '프로필' : kind === 'followRequest' ? '팔로우 요청 관리 화면' : '게시글';
  const preview = kind === 'reaction' || kind === 'repost' ? props.preview : undefined;
  const excerpt =
    preview === null
      ? '게시글을 볼 수 없습니다'
      : preview?.contentWarning
        ? `내용 경고: ${preview.contentWarning}`
        : preview?.bodyText;
  const media =
    preview && !preview.contentWarning && !preview.sensitiveMedia ? preview.media?.[0] : undefined;
  const label = `${subject} ${actions[kind]}. ${timestamp}.${unread ? ' 읽지 않은 알림.' : ''}${excerpt ? ` ${excerpt}.` : ''}${media ? ` ${media.altText?.trim() || '첨부 이미지'}.` : ''} ${destination}${kind === 'followRequest' ? '으로' : '로'} 이동`;
  const KindIcon = kind === 'reaction' ? Smile : kind === 'repost' ? Repeat2 : UserRoundPlus;
  const iconColor =
    kind === 'reaction'
      ? theme.actionReactionBase
      : kind === 'repost'
        ? theme.actionRepostBase
        : theme.foregroundSecondary;
  const avatarStack = (
    <View style={styles.avatars}>
      {actors.slice(0, 3).map((item, index) => (
        <Avatar
          key={item.id}
          imageUri={item.avatarUrl}
          label={item.name}
          size={28}
          style={index > 0 ? styles.overlap : undefined}
        />
      ))}
    </View>
  );
  const copy = (
    <Text style={[styles.copy, { color: theme.foregroundPrimary }]}>
      <Text style={textStyles.uiLabelM}>
        {actor.name}
        {otherCount > 0 ? ` 외 ${otherCount}명` : ''}
      </Text>
      {otherCount > 0 ? '이 ' : '님이 '}
      {actions[kind]}
    </Text>
  );
  const time = <Text style={[styles.time, { color: theme.foregroundSecondary }]}>{timestamp}</Text>;
  const target = (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="link"
      accessibilityState={{ busy: pending, disabled: blocked }}
      aria-busy={pending}
      aria-disabled={blocked}
      disabled={blocked}
      onBlur={() => setFocusVisible(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(web && Boolean(target.matches?.(':focus-visible')));
      }}
      onPointerDown={() => setFocusVisible(false)}
      onPress={blocked ? undefined : onNavigate}
      style={[
        styles.target,
        {
          outlineColor: theme.stateFocusRing,
          outlineOffset: -2,
          outlineStyle: focusVisible ? 'solid' : 'none',
          outlineWidth: focusVisible ? 2 : 0,
          opacity: blocked ? 0.5 : 1,
        } as ViewStyle,
      ]}
    >
      <View
        style={[
          styles.row,
          web && styles.webRow,
          kind === 'reply' && styles.replyRow,
          {
            backgroundColor:
              web && hovered
                ? theme.stateHover
                : web && unread
                  ? theme.actionPrimarySubtle
                  : 'transparent',
          },
        ]}
      >
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.kind, kind === 'reply' && styles.replyKind]}
        >
          {kind === 'reply' ? avatarStack : <KindIcon color={iconColor} size={32} />}
        </View>
        <View style={[styles.summary, kind === 'reply' && styles.replySummary]}>
          {kind === 'reply' ? (
            <>
              {copy}
              {time}
            </>
          ) : (
            <>
              <View style={styles.avatarAndTime}>
                {avatarStack}
                {time}
              </View>
              {copy}
            </>
          )}
        </View>
        {web && unread ? (
          <View style={[styles.unreadRail, { backgroundColor: theme.actionPrimaryBase }]} />
        ) : null}
      </View>
      {preview !== undefined ? (
        <View style={[styles.preview, web && styles.webPreview]}>
          <Text numberOfLines={1} style={[styles.excerpt, { color: theme.foregroundSecondary }]}>
            {excerpt}
          </Text>
          {media ? (
            <View style={styles.thumbnail}>
              <PostMediaImage fill index={0} interactive={false} item={media} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <PostContentPrivacyBoundary
      style={[styles.root, { borderBottomColor: theme.borderSubtle }]}
      testID="notification-list-item"
    >
      {blocked ? (
        target
      ) : (
        <Link asChild href={href}>
          {target}
        </Link>
      )}
      {kind === 'reply' ? props.children : null}
    </PostContentPrivacyBoundary>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: borderWidths[1], minWidth: 0, width: '100%' },
  target: { minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[12],
    paddingHorizontal: space[8],
    paddingTop: space[16],
    paddingBottom: space[8],
    minHeight: 80,
  },
  webRow: { paddingLeft: space[12], paddingRight: space[16] },
  kind: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48, flexShrink: 0 },
  summary: { flex: 1, minWidth: 0, gap: space[8] },
  avatarAndTime: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[8],
    minHeight: 28,
  },
  avatars: { alignItems: 'center', flexDirection: 'row' },
  overlap: { marginLeft: -space[12] },
  copy: { ...textStyles.uiCopyM, flexShrink: 1, minWidth: 0 },
  time: { ...textStyles.uiCopyS, flexShrink: 0 },
  replyRow: { paddingTop: space[8], minHeight: 48 },
  replyKind: { alignItems: 'flex-end', height: 28 },
  replySummary: { alignItems: 'center', flexDirection: 'row', minHeight: 28 },
  preview: {
    flexDirection: 'row',
    gap: space[12],
    alignItems: 'flex-start',
    paddingLeft: space[8] + 48 + space[12],
    paddingRight: space[8],
    paddingBottom: space[16],
  },
  webPreview: { paddingLeft: space[12] + 48 + space[12], paddingRight: space[16] },
  excerpt: { ...textStyles.contentM, flex: 1, minWidth: 0 },
  thumbnail: { height: 64, width: 64, flexShrink: 0, borderRadius: radius[8], overflow: 'hidden' },
  unreadRail: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: space[4],
  },
});
