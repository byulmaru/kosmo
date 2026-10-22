import { Link } from 'expo-router';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PostContentPrivacyBoundary } from '@/components/post/PostContentPrivacyBoundary';
import { PostMediaImage } from '@/components/post/PostMediaImage';
import { Avatar } from '@/components/ui/Avatar';
import { TimestampText } from '@/components/ui/TimestampText';
import { useAnimatedColorTransition } from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { notificationKindPresentations } from './notificationKindPresentation';
import { NotificationKindRail, NotificationLinkTarget } from './NotificationLinkTarget';
import type { Href } from 'expo-router';
import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';
import type { PostMediaItem } from '@/components/post/PostMediaImage';
import type { NotificationHrefTarget } from './notificationHref';

type Actor = { id: string; name: string; avatarUrl?: string | null };
type ProfileActor = Actor & { profileHref: Href };

type Preview = {
  bodyText: string;
  contentWarning: string | null;
  media: readonly PostMediaItem[] | null;
  sensitiveMedia: boolean;
};

type ActorSummary<TActor extends Actor = Actor> = {
  actors: readonly [TActor, ...TActor[]];
  /** Server-owned total; never infer grouping or actor order here. */
  totalActorCount?: number;
  actor?: never;
  children?: never;
};

type FollowNotificationProps = {
  href: Href;
  onNavigate?: () => void;
  timestamp: string;
  unread?: boolean;
  disabled?: boolean;
  pending?: boolean;
} & ActorSummary & { kind: 'follow' | 'followRequest'; preview?: never };

type ReactionRepostNotificationProps = {
  href: Href;
  onNavigate?: () => void;
  timestamp: string;
  unread?: boolean;
  disabled?: boolean;
  pending?: boolean;
} & (ActorSummary<ProfileActor> & { kind: 'reaction' | 'repost'; preview: Preview | null });

type GroupedNotificationProps = FollowNotificationProps | ReactionRepostNotificationProps;

type PostNotificationChildProps = {
  kind: 'mention' | 'reply' | 'quote';
  unread?: boolean;
  /** Compose a post notification surface; this wrapper owns the divider and Read state. */
  children: ReactElement;
  actor?: never;
  actors?: never;
  totalActorCount?: never;
  preview?: never;
  href?: never;
  timestamp?: never;
  onNavigate?: never;
  disabled?: never;
  pending?: never;
};

type OperationalNotificationProps = {
  body: string | null;
  href: NotificationHrefTarget;
  kind: 'operational';
  onNavigate: () => void;
  timestamp: string;
  title: string;
  unread?: boolean;
  actor?: never;
  actors?: never;
  totalActorCount?: never;
  preview?: never;
  children?: never;
  disabled?: never;
  pending?: never;
};

export type SourceUnavailableNotificationKind = keyof typeof notificationKindPresentations;

type SourceUnavailableNotificationProps = {
  kind: SourceUnavailableNotificationKind;
  sourceUnavailable: true;
  timestamp: string;
  unread?: boolean;
};

export type NotificationListItemViewProps =
  | GroupedNotificationProps
  | PostNotificationChildProps
  | OperationalNotificationProps
  | SourceUnavailableNotificationProps;

const actions = {
  follow: '팔로우했습니다',
  followRequest: '팔로우를 요청했습니다',
  reaction: '이 게시글에 반응했습니다',
  repost: '이 게시글을 재게시했습니다',
} as const;

/** Presentation only. The consumer owns navigation and Read state. */
export function NotificationListItemView(props: NotificationListItemViewProps) {
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const unread = props.unread ?? false;
  const sourceUnavailable = isSourceUnavailableNotification(props);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  return (
    <PostContentPrivacyBoundary
      style={[styles.root, { borderBottomColor: theme.borderSubtle }]}
      testID="notification-list-item"
    >
      <View
        onPointerEnter={sourceUnavailable ? undefined : () => setHovered(true)}
        onPointerLeave={sourceUnavailable ? undefined : () => setHovered(false)}
        style={{
          backgroundColor: unread ? theme.actionPrimarySubtle : 'transparent',
          position: 'relative',
        }}
        testID="notification-item-surface"
      >
        <NotificationHoverOverlay
          active={web && hovered && !sourceUnavailable}
          reducedMotion={reducedMotion}
          theme={theme}
        />
        {sourceUnavailable ? (
          <SourceUnavailableNotificationTarget {...props} />
        ) : isPostNotificationChild(props) ? (
          <>
            {unread ? <Text style={styles.srOnly}>읽지 않은 알림</Text> : null}
            <View style={styles.replyInset} testID="reply-notification-inset">
              {props.children}
            </View>
          </>
        ) : props.kind === 'operational' ? (
          <OperationalNotificationTarget {...props} />
        ) : isReactionRepostNotification(props) ? (
          <ReactionRepostNotificationTargets {...props} />
        ) : (
          <NotificationTarget {...props} />
        )}
        {unread ? (
          <View style={[styles.unreadRail, { backgroundColor: theme.actionPrimaryBase }]} />
        ) : null}
      </View>
    </PostContentPrivacyBoundary>
  );
}

function NotificationHoverOverlay({
  active,
  reducedMotion,
  theme,
}: {
  active: boolean;
  reducedMotion: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const backgroundColor = useAnimatedColorTransition({
    color: active ? theme.stateHover : 'transparent',
    interactionKey: active ? 'hovered' : 'idle',
    reducedMotion,
    role: 'interaction',
  });

  return (
    <Animated.View
      aria-hidden
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor } as unknown as ViewStyle]}
      testID="notification-hover-overlay"
    />
  );
}

function isSourceUnavailableNotification(
  props: NotificationListItemViewProps,
): props is SourceUnavailableNotificationProps {
  return 'sourceUnavailable' in props && props.sourceUnavailable;
}

function SourceUnavailableNotificationTarget({
  kind,
  timestamp,
  unread = false,
}: SourceUnavailableNotificationProps) {
  const theme = useTheme();
  const { Icon, label } = notificationKindPresentations[kind];
  const iconColor =
    kind === 'reaction'
      ? theme.actionReactionBase
      : kind === 'repost'
        ? theme.actionRepostBase
        : theme.foregroundSecondary;

  return (
    <View
      style={[styles.row, styles.sourceUnavailableRow, Platform.OS === 'web' && styles.webRow]}
      testID={`notification-source-unavailable-${kind}`}
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.kind}
      >
        <Icon color={iconColor} size={32} />
      </View>
      <View style={styles.sourceUnavailableSummary}>
        <Text style={[styles.copy, { color: theme.foregroundPrimary }]}>{label}</Text>
        <TimestampText style={styles.time}>{timestamp}</TimestampText>
        {unread ? <Text style={styles.srOnly}>읽지 않은 알림</Text> : null}
      </View>
    </View>
  );
}

function OperationalNotificationTarget({
  body,
  href,
  onNavigate,
  timestamp,
  title,
  unread = false,
}: OperationalNotificationProps) {
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const [focusVisible, setFocusVisible] = useState(false);
  const label = `${title}.${body ? ` ${body}.` : ''} ${timestamp}.${unread ? ' 읽지 않은 알림.' : ''} 알림 열기`;
  const target = (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="link"
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const control = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(web && Boolean(control.matches?.(':focus-visible')));
      }}
      onPointerDown={() => setFocusVisible(false)}
      onPress={onNavigate}
      style={StyleSheet.flatten([
        styles.operationalTarget,
        {
          outlineColor: theme.stateFocusRing,
          outlineOffset: -2,
          outlineStyle: focusVisible ? 'solid' : 'none',
          outlineWidth: focusVisible ? 2 : 0,
        } as ViewStyle,
      ])}
      testID="operational-notification-target"
    >
      <View style={styles.operationalSummary}>
        <View style={styles.operationalTitleRow}>
          <Text
            style={[
              textStyles.uiLabelL,
              styles.operationalTitle,
              { color: theme.foregroundPrimary },
            ]}
          >
            {title}
          </Text>
          <TimestampText style={styles.time}>{timestamp}</TimestampText>
        </View>
        {body ? (
          <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>{body}</Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Link asChild href={href.href as Href} push={href.kind === 'internal' && Platform.OS !== 'web'}>
      {target}
    </Link>
  );
}

function isPostNotificationChild(
  props: NotificationListItemViewProps,
): props is PostNotificationChildProps {
  return props.kind === 'mention' || props.kind === 'reply' || props.kind === 'quote';
}

function isReactionRepostNotification(
  props: NotificationListItemViewProps,
): props is ReactionRepostNotificationProps {
  return props.kind === 'reaction' || props.kind === 'repost';
}

function getActorCountSummary(actors: readonly [Actor, ...Actor[]], totalActorCount?: number) {
  const suppliedCount = totalActorCount ?? actors.length;
  const count = Math.max(
    actors.length,
    Number.isFinite(suppliedCount) ? Math.floor(suppliedCount) : actors.length,
  );
  const otherCount = count - 1;
  const subject = `${actors[0].name}${otherCount > 0 ? ` 외 ${otherCount}명이` : '님이'}`;
  return { otherCount, subject };
}

function NotificationTarget(props: FollowNotificationProps) {
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
  const actors = props.actors;
  const actor = actors[0];
  const { otherCount, subject } = getActorCountSummary(actors, props.totalActorCount);
  const destination = kind === 'follow' ? '프로필' : '팔로우 요청 관리 화면';
  const label = `${subject} ${actions[kind]}. ${timestamp}.${unread ? ' 읽지 않은 알림.' : ''} ${destination}${kind === 'followRequest' ? '으로' : '로'} 이동`;
  const KindIcon = notificationKindPresentations[kind].Icon;
  const iconColor = theme.foregroundSecondary;
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
      <Text style={textStyles.uiLabelL}>
        {actor.name}
        {otherCount > 0 ? ` 외 ${otherCount}명` : ''}
      </Text>
      {otherCount > 0 ? '이 ' : '님이 '}
      {actions[kind]}
    </Text>
  );
  const time = <TimestampText style={styles.time}>{timestamp}</TimestampText>;
  return (
    <NotificationLinkTarget
      accessibilityLabel={label}
      disabled={disabled}
      href={href}
      onActivate={onNavigate}
      pending={pending}
      style={styles.target}
    >
      <View style={[styles.row, web && styles.webRow]}>
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.kind}
        >
          <KindIcon color={iconColor} size={32} />
        </View>
        <View style={styles.summary}>
          <View style={styles.avatarAndTime}>
            {avatarStack}
            {time}
          </View>
          {copy}
        </View>
      </View>
    </NotificationLinkTarget>
  );
}

function ReactionRepostNotificationTargets({
  actors,
  disabled = false,
  href,
  kind,
  onNavigate,
  pending = false,
  preview,
  timestamp,
  totalActorCount,
  unread = false,
}: ReactionRepostNotificationProps) {
  const theme = useTheme();
  const actor = actors[0];
  const { otherCount, subject } = getActorCountSummary(actors, totalActorCount);
  const excerpt =
    preview === null
      ? '게시글을 볼 수 없습니다'
      : preview.contentWarning
        ? `내용 경고: ${preview.contentWarning}`
        : preview.bodyText;
  const media =
    preview && !preview.contentWarning && !preview.sensitiveMedia ? preview.media?.[0] : undefined;
  const label = `${subject} ${actions[kind]}. ${timestamp}.${unread ? ' 읽지 않은 알림.' : ''}${excerpt ? ` ${excerpt}.` : ''}${media ? ` ${media.altText?.trim() || '첨부 이미지'}.` : ''} 게시글로 이동`;
  const KindIcon = notificationKindPresentations[kind].Icon;
  const iconColor = kind === 'reaction' ? theme.actionReactionBase : theme.actionRepostBase;
  const visibleActors = actors.slice(0, 3);
  const copy = (
    <Text style={[styles.copy, { color: theme.foregroundPrimary }]}>
      <Text style={textStyles.uiLabelL}>
        {actor.name}
        {otherCount > 0 ? ` 외 ${otherCount}명` : ''}
      </Text>
      {otherCount > 0 ? '이 ' : '님이 '}
      {actions[kind]}
    </Text>
  );

  return (
    <View style={[styles.row, styles.postActionRow, Platform.OS === 'web' && styles.webRow]}>
      <NotificationKindRail
        accessibilityLabel={label}
        disabled={disabled}
        href={href}
        onActivate={onNavigate}
        pending={pending}
        testID="notification-kind-target"
        iconTestID={`${kind}-notification-kind`}
      >
        <KindIcon color={iconColor} size={32} />
      </NotificationKindRail>
      <View style={styles.summary}>
        <View style={styles.avatarAndTime}>
          <View style={styles.profileAvatars}>
            {visibleActors.map((item) => (
              <NotificationLinkTarget
                key={item.id}
                accessibilityLabel={`${item.name} 프로필로 이동`}
                disabled={disabled}
                href={item.profileHref}
                onActivate={onNavigate}
                pending={pending}
                style={styles.profileTarget}
              >
                <Avatar imageUri={item.avatarUrl} label={item.name} size={28} />
              </NotificationLinkTarget>
            ))}
          </View>
          <NotificationLinkTarget
            accessibilityLabel={label}
            disabled={disabled}
            href={href}
            onActivate={onNavigate}
            pending={pending}
            style={styles.timeTarget}
            testID="notification-post-time-target"
          >
            <TimestampText style={styles.time}>{timestamp}</TimestampText>
          </NotificationLinkTarget>
        </View>
        <NotificationLinkTarget
          accessibilityLabel={label}
          disabled={disabled}
          href={href}
          onActivate={onNavigate}
          pending={pending}
          style={styles.summaryTarget}
          testID="notification-post-summary-target"
        >
          {copy}
        </NotificationLinkTarget>
        <NotificationLinkTarget
          accessibilityLabel={label}
          disabled={disabled}
          href={href}
          onActivate={onNavigate}
          pending={pending}
          style={styles.previewTarget}
          testID="notification-post-preview-target"
        >
          <>
            <Text numberOfLines={1} style={[styles.excerpt, { color: theme.foregroundSecondary }]}>
              {excerpt}
            </Text>
            {media ? (
              <View style={styles.thumbnail}>
                <PostMediaImage fill index={0} interactive={false} item={media} />
              </View>
            ) : null}
          </>
        </NotificationLinkTarget>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: borderWidths[1], minWidth: 0, width: '100%' },
  target: { minWidth: 0 },
  profileTarget: {
    alignItems: 'center',
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  profileAvatars: { alignItems: 'center', flexDirection: 'row' },
  timeTarget: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 28,
    minWidth: 0,
  },
  summaryTarget: {
    alignItems: 'flex-start',
    minHeight: 24,
    minWidth: 0,
    width: '100%',
  },
  previewTarget: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space[12],
    minHeight: 24,
    minWidth: 0,
    paddingBottom: space[8],
    width: '100%',
  },
  operationalTarget: {
    minHeight: 80,
    paddingHorizontal: space[12],
    paddingVertical: space[16],
    width: '100%',
  },
  operationalSummary: { flex: 1, gap: space[8], minWidth: 0 },
  operationalTitleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space[8] },
  operationalTitle: { flex: 1, minWidth: 0 },
  replyInset: {
    paddingLeft: Platform.OS === 'web' ? space[12] : space[8],
    paddingRight: Platform.OS === 'web' ? space[24] : space[8],
  },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', left: 0, top: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[12],
    paddingHorizontal: space[8],
    paddingTop: space[16],
    paddingBottom: space[8],
    minHeight: 80,
  },
  sourceUnavailableRow: { alignItems: 'center' },
  postActionRow: { paddingBottom: 0 },
  webRow: { paddingLeft: space[12], paddingRight: space[24] },
  kind: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48, flexShrink: 0 },
  summary: { flex: 1, minWidth: 0, gap: space[8] },
  sourceUnavailableSummary: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  avatarAndTime: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[8],
    minHeight: 28,
  },
  avatars: { alignItems: 'center', flexDirection: 'row' },
  overlap: { marginLeft: -space[12] },
  copy: { ...textStyles.uiCopyL, flexShrink: 1, minWidth: 0 },
  time: { flexShrink: 0 },
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
