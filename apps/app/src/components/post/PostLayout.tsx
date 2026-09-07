import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatPostDate } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { PostActionSurface } from './PostActionSurface';
import { PostBody } from './PostBody';
import { PostContentPrivacyBoundary } from './PostContentPrivacyBoundary';
import { usePostMediaViewerHost } from './PostMediaViewerHost';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePreview } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import type { LayoutChangeEvent } from 'react-native';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
import type { PostContentWarningPresentation } from './PostContentRenderer';
import type { PostMediaOpenHandler } from './PostMediaImage';

const PostLayoutFragment = graphql`
  fragment PostLayout_post on Post {
    id
    createdAt
    visibility
    content {
      id
      bodyText
      media {
        id
        altText
        url
      }
      contentWarning
    }
    profile {
      avatar {
        id
        url
      }
      id
      handle
      relativeHandle
      displayName
      ...ProfileNameBlock_profile
    }
    replyParent {
      id
    }
    ...ReplyComposerSurface_parent @alias(as: "replySurface")
    ...PostActionSurface_post @alias(as: "actionSurface")
    repostSource {
      ...PostSourcePreview_source
      ...PostActionSurface_post @alias(as: "actionSurface")
    }
    ...PostBody_post
  }
`;

const visibilityLabels: Record<string, string> = {
  PUBLIC: '전체 공개',
  UNLISTED: '조용히 공개',
  FOLLOWERS: '팔로워 공개',
  DIRECT: '다이렉트',
};

export function PostLayout({
  contentWarningPresentation = 'default',
  mediaPresentation = 'default',
  onDeleted,
  post: postKey,
  presentation = 'default',
  replyAvailable,
  replySurfacePostId,
}: {
  contentWarningPresentation?: PostContentWarningPresentation;
  mediaPresentation?: 'default' | 'hidden';
  onDeleted?: () => void;
  post: PostLayout_post$key;
  presentation?: 'compact' | 'default';
  replyAvailable?: boolean;
  replySurfacePostId?: string;
}) {
  const theme = useTheme();
  const post = useFragment(PostLayoutFragment, postKey);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const bodyMeasurementKey = JSON.stringify([post.content?.id, post.content?.bodyText]);
  const currentBodyMeasurementKey = useRef(bodyMeasurementKey);
  currentBodyMeasurementKey.current = bodyMeasurementKey;
  const [bodyMeasurement, setBodyMeasurement] = useState({ key: '', overflow: false });
  const bodyHasOverflow = bodyMeasurement.key === bodyMeasurementKey && bodyMeasurement.overflow;
  const lastContentRevision = useRef<string | null>(post.content?.id ?? null);
  const compact = presentation === 'compact';
  const compactBodyToggleTargetSize =
    Platform.OS === 'android' ? 48 : Platform.OS === 'ios' ? 44 : undefined;
  const bodyVisible = contentWarningPresentation === 'revealed' || !post.content?.contentWarning;
  useEffect(() => {
    const contentRevision = post.content?.id;
    if (
      contentRevision &&
      lastContentRevision.current &&
      contentRevision !== lastContentRevision.current
    ) {
      setBodyExpanded(false);
    }
    if (contentRevision) {
      lastContentRevision.current = contentRevision;
    }
  }, [post.content?.id]);
  const openViewer = usePostMediaViewerHost();
  const replyBinding = usePostReplyBinding(replySurfacePostId ?? post.id);
  const replyAuthentication = usePostActionAuthentication(replyAvailable ?? Boolean(post.content));
  const replyTriggerRef = useRef<View>(null);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const source = post.repostSource;
  const pureRepost = !post.content && !post.replyParent && post.repostSource;
  const socialActionTarget = pureRepost ? post.repostSource?.actionSurface : post.actionSurface;
  const handleDeleted = useCallback(() => onDeleted?.(), [onDeleted]);
  const handleMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      openViewer({
        mediaOwnerPostId: post.id,
        onDeleted: handleDeleted,
        originControl,
        selectedIndex,
        surfacePostId: post.id,
      });
    },
    [handleDeleted, openViewer, post.id],
  );
  const handleBodyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (currentBodyMeasurementKey.current !== bodyMeasurementKey) {
        return;
      }
      setBodyMeasurement({
        key: bodyMeasurementKey,
        overflow:
          event.nativeEvent.layout.height >
          typography.md.lineHeight * PixelRatio.getFontScale() * 3 + 0.5,
      });
    },
    [bodyMeasurementKey],
  );
  const reply: PostActionBarProps['reply'] = replyBinding
    ? {
        accessibilityLabel: '답글',
        controlRef: replyTriggerRef,
        expanded: replyAuthentication.execution.kind === 'enabled' && replyBinding.expanded,
        onPress: () => {
          if (replyAuthentication.execution.kind === 'resolution-required') {
            replyAuthentication.resolve(replyAuthentication.execution.reason);
          } else if (replyAuthentication.execution.kind === 'enabled') {
            replyBinding.onPress();
          }
        },
        processing: getReplyProcessingState(
          replyAuthentication.execution,
          Boolean(replyBinding.profile),
        ),
      }
    : undefined;
  const body = (
    <PostBody
      contentWarningPresentation={contentWarningPresentation}
      mediaPresentation={mediaPresentation}
      numberOfLines={compact && !bodyExpanded ? 3 : undefined}
      onMediaOpen={mediaPresentation === 'hidden' ? undefined : handleMediaOpen}
      post={post}
      size={compact ? 'md' : 'lg'}
    />
  );
  return (
    <View style={[styles.root, compact ? styles.compactRoot : null]}>
      <View style={[styles.header, compact ? styles.compactHeader : null]}>
        <Link asChild href={profileHref}>
          <Pressable
            aria-hidden
            accessibilityElementsHidden
            accessible={false}
            focusable={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.avatar}
            tabIndex={-1}
          >
            <Avatar
              imageUri={post.profile.avatar?.url}
              label={post.profile.displayName || post.profile.handle}
              size={compact ? 40 : 48}
            />
          </Pressable>
        </Link>
        <View style={styles.headerContent}>
          <ProfileNameBlock href={profileHref} profile={post.profile} />
        </View>
      </View>
      <View style={[styles.body, compact ? styles.compactBody : null]}>
        {compact ? (
          <View style={styles.compactBodyRegion} testID="post-layout-body-region">
            {post.content?.bodyText && bodyVisible ? (
              <View
                {...(Platform.OS === 'web'
                  ? { 'aria-hidden': true }
                  : {
                      accessibilityElementsHidden: true,
                      importantForAccessibility: 'no-hide-descendants' as const,
                    })}
                style={styles.bodyMeasureBoundary}
                testID="post-layout-body-measure-container"
              >
                <PostContentPrivacyBoundary
                  style={styles.bodyMeasurePrivacyBoundary}
                  testID="post-layout-body-measure-privacy-boundary"
                >
                  <Text
                    key={bodyMeasurementKey}
                    accessible={false}
                    onLayout={handleBodyLayout}
                    style={[styles.bodyMeasure, { color: theme.text }]}
                    testID="post-layout-body-measure"
                  >
                    {post.content.bodyText}
                  </Text>
                </PostContentPrivacyBoundary>
              </View>
            ) : null}
            {bodyExpanded ? (
              <ScrollView
                accessibilityLabel="펼친 원문"
                style={styles.bodyScroll}
                tabIndex={0}
                testID="post-layout-body-scroll"
              >
                {body}
              </ScrollView>
            ) : (
              <View style={styles.collapsedBody} testID="post-layout-collapsed-body">
                {body}
              </View>
            )}
            {bodyHasOverflow && bodyVisible && post.content?.bodyText ? (
              <Pressable
                accessibilityLabel={bodyExpanded ? '원문 접기' : '원문 더 보기'}
                accessibilityRole="button"
                accessibilityState={{ expanded: bodyExpanded }}
                aria-expanded={bodyExpanded}
                onPress={() => setBodyExpanded((value) => !value)}
                style={[
                  styles.moreButton,
                  compactBodyToggleTargetSize
                    ? {
                        minHeight: compactBodyToggleTargetSize,
                        minWidth: compactBodyToggleTargetSize,
                      }
                    : null,
                ]}
              >
                <Text style={[styles.moreText, { color: theme.textSecondary }]}>
                  {bodyExpanded ? '접기' : '더 보기'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          body
        )}
        {!compact && source ? <PostSourcePreview source={source} style={styles.source} /> : null}
        {!compact ? (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {formatPostDate(post.createdAt)} ·{' '}
            {visibilityLabels[post.visibility] ?? post.visibility}
          </Text>
        ) : null}
        <View style={styles.engagement} testID="post-layout-engagement">
          <PostActionSurface
            actionBarStyle={[styles.actionBarFrame, { borderColor: theme.borderSubtle }]}
            onDeleted={handleDeleted}
            reactionSummaryStyle={compact ? styles.compactReactionSummary : undefined}
            reply={reply}
            socialActionTarget={socialActionTarget!}
          />
        </View>
        {!compact &&
        replyBinding?.expanded &&
        replyAuthentication.execution.kind === 'enabled' &&
        replyBinding?.profile &&
        post.content &&
        post.replySurface ? (
          <View style={styles.replySurface}>
            <ReplyComposerSurface
              ref={replyBinding.surfaceRef}
              onPostCreated={replyBinding.onPostCreated}
              onRequestClose={replyBinding.onRequestClose}
              open={replyBinding.expanded}
              owner={replyBinding.owner}
              parent={post.replySurface}
              profile={replyBinding.profile}
              triggerRef={replyTriggerRef}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, minWidth: 0 },
  compactRoot: { flexShrink: 1, gap: spacing.xs, minHeight: 0 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  compactHeader: { alignItems: 'center', gap: spacing.sm },
  avatar: { borderRadius: radii.full },
  headerContent: { flex: 1, minWidth: 0 },
  body: { minWidth: 0 },
  compactBody: { flexShrink: 1, minHeight: 0 },
  compactBodyRegion: { flexShrink: 1, minHeight: 0, position: 'relative' },
  bodyMeasureBoundary: {
    height: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  bodyMeasurePrivacyBoundary: { minWidth: 0 },
  bodyMeasure: {
    fontFamily: 'Pretendard',
    opacity: 0,
    ...typography.md,
  },
  collapsedBody: { flexShrink: 1, minHeight: 0, overflow: 'hidden' },
  bodyScroll: { flexShrink: 1, minHeight: 0 },
  actionBarFrame: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  engagement: { gap: spacing.xs, marginTop: spacing.sm, width: '100%' },
  compactReactionSummary: { display: 'none' },
  moreButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 44,
  },
  moreText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  meta: { fontFamily: 'SUIT', marginTop: 6, textAlign: 'right', ...typography.xsm },
  source: { marginTop: spacing.sm },
  replySurface: { marginTop: spacing.lg },
});
