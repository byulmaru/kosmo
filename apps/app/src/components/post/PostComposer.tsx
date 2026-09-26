import { PostVisibility } from '@kosmo/core/enums';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import {
  ChartNoAxesColumnIncreasingIcon,
  ChevronDownIcon,
  ExpandIcon,
  ImagePlusIcon,
  SmileIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react-native';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextArea, TextField } from '@/components/ui/TextField';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import {
  borderWidths,
  iconSizes,
  radius,
  space,
  textStyles,
  webScrollbarStyle,
} from '@/theme/tokens';
import { PostComposerMediaItemsTarget } from './PostComposerMediaItemsTarget';
import { postVisibilityPresentation } from './postVisibilityPresentation';
import type { ReactNode, RefObject } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ComposerMediaItem } from './PostComposerMediaControls';

const postComposerTargetVisibilityValues = [
  PostVisibility.PUBLIC,
  PostVisibility.UNLISTED,
  PostVisibility.FOLLOWERS,
] as const;

export type PostComposerVisibility = (typeof postComposerTargetVisibilityValues)[number];
export type PostComposerMode = 'post' | 'quote' | 'reply';

export type PostComposerProps = Readonly<{
  author: ReactNode;
  beforeEditor?: ReactNode;
  children?: ReactNode;
  body: string;
  bodyRef?: RefObject<TextInput | null>;
  contentWarning: string;
  contentWarningExpanded: boolean;
  expandControlRef?: RefObject<View | null>;
  items: readonly ComposerMediaItem[];
  onBodyChange: (value: string) => void;
  onContentWarningChange: (value: string) => void;
  onContentWarningToggle: () => void;
  onEmojiAction: () => void;
  onExpand: () => void;
  onMediaAction: () => void;
  onMediaEdit: (itemId: string, tool: 'alt' | 'sensitive') => void;
  onMediaRemove: (itemId: string) => void;
  onMediaRetry: (itemId: string) => void;
  onPollAction: () => void;
  onSubmit: () => void;
  onVisibilityChange: (value: PostComposerVisibility) => void;
  remaining: number;
  sensitiveMedia: boolean;
  showCWAction?: boolean;
  showEmojiAction?: boolean;
  showMediaAction?: boolean;
  showPollAction?: boolean;
  showSubmit?: boolean;
  submitting?: boolean;
  mode?: PostComposerMode;
  surface: 'overlay' | 'rail';
  visibility: PostComposerVisibility;
}>;

export type MobileFullscreenComposerShellCandidateProps = Omit<
  PostComposerProps,
  'onExpand' | 'showSubmit' | 'surface'
> &
  Readonly<{ fillContainer?: boolean; keyboard?: boolean; onOverlayClose: () => void }>;

const visibilityOptions = postComposerTargetVisibilityValues.map((value) => ({
  ...postVisibilityPresentation[value],
  value,
}));

const composerBodyFocusStyle = {
  borderWidth: borderWidths[0],
  outlineStyle: 'solid',
  outlineWidth: 0,
} as unknown as TextStyle;
const composerFieldFocusStyle = {
  borderWidth: borderWidths[1],
  outlineWidth: 0,
} as unknown as TextStyle;
const railBodyMaxHeight = 300;

function useVisibilityMenu(
  submitting: boolean,
  onVisibilityChange: PostComposerProps['onVisibilityChange'],
) {
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const controlRef = useRef<View>(null);
  const menuRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  useEffect(() => {
    if (submitting) {
      setVisibilityOpen(false);
    }
  }, [submitting]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !visibilityOpen) {
      return;
    }
    const control = controlRef.current as unknown as HTMLElement;
    const menu = menuRef.current as unknown as HTMLElement;
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="radio"], [role="menuitemradio"]'),
    );
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const dismissOutside = (event: Event) => {
      if (!control.contains(event.target as Node)) {
        setVisibilityOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setVisibilityOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!menu.contains(document.activeElement)) {
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLElement);
      if ([' ', 'Enter'].includes(event.key) && index >= 0) {
        event.preventDefault();
        event.stopPropagation();
        items[index]?.click();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
      const option = visibilityOptions[next];
      if (option) {
        onVisibilityChange(option.value);
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onVisibilityChange, visibilityOpen]);
  return { controlRef, menuRef, setVisibilityOpen, triggerRef, visibilityOpen };
}

const composerCopy: Record<
  PostComposerMode,
  {
    bodyLabel: string;
    submit: string;
    title: string;
  }
> = {
  post: {
    bodyLabel: '게시글 본문',
    submit: '게시',
    title: '글쓰기',
  },
  quote: {
    bodyLabel: '인용 게시글 본문',
    submit: '게시',
    title: '글쓰기',
  },
  reply: {
    bodyLabel: '답글 본문',
    submit: '게시',
    title: '글쓰기',
  },
};

const composerPlaceholder = '무슨 일이 일어나고 있나요?';

export function PostComposer({
  author,
  beforeEditor,
  body,
  bodyRef,
  children,
  contentWarning,
  contentWarningExpanded,
  expandControlRef,
  items,
  onBodyChange,
  onContentWarningChange,
  onContentWarningToggle,
  onEmojiAction,
  onExpand,
  onMediaAction,
  onMediaEdit,
  onMediaRemove,
  onMediaRetry,
  onPollAction,
  onSubmit,
  onVisibilityChange,
  remaining,
  sensitiveMedia,
  showCWAction = true,
  showEmojiAction = true,
  showMediaAction = true,
  showPollAction = true,
  showSubmit = true,
  submitting = false,
  mode = 'post',
  surface,
  visibility,
}: PostComposerProps) {
  const theme = useTheme();
  const copy = composerCopy[mode];
  const remainingDescriptionId = useId();
  const bodyInputRef = useRef<TextInput>(null);
  const [bodyContentHeight, setBodyContentHeight] = useState(0);
  const [bodyFocused, setBodyFocused] = useState(false);
  const { controlRef, menuRef, setVisibilityOpen, triggerRef, visibilityOpen } = useVisibilityMenu(
    submitting,
    onVisibilityChange,
  );
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const input = (bodyRef ?? bodyInputRef).current as unknown as HTMLTextAreaElement | null;
    if (!input) {
      return;
    }
    input.style.height = '0px';
    const height = input.scrollHeight;
    input.style.height = `${height}px`;
    setBodyContentHeight(height);
  }, [body, bodyRef, items.length, surface]);
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const SelectedVisibilityIcon = selectedVisibility.icon;
  const hasTrailingContent = children !== undefined && children !== null;
  const disabled =
    submitting ||
    items.some((item) => item.state !== 'ready') ||
    (body.trim().length === 0 && items.length === 0) ||
    remaining < 0;
  const mediaGallery = (
    <PostComposerMediaItemsTarget
      compact={surface === 'rail'}
      disabled={submitting}
      media={items}
      onEdit={onMediaEdit}
      onRemove={onMediaRemove}
      onRetry={(item) => onMediaRetry(item.key)}
      sensitiveMedia={sensitiveMedia}
    />
  );
  const unifiedOverlayScroll = surface === 'overlay';
  const editorContent = (
    <View
      style={[
        styles.content,
        items.length === 0 && !hasTrailingContent ? styles.textContent : null,
        surface === 'overlay' ? styles.overlayContent : null,
      ]}
    >
      <TextArea
        aria-describedby={Platform.OS === 'web' ? remainingDescriptionId : undefined}
        accessibilityLabel={copy.bodyLabel}
        editable={!submitting}
        ref={bodyRef ?? bodyInputRef}
        onBlur={() => setBodyFocused(false)}
        onChange={(event) => {
          if (Platform.OS === 'web') {
            const input = event.currentTarget as unknown as HTMLTextAreaElement;
            input.style.height = '0px';
            const height = input.scrollHeight;
            input.style.height = `${height}px`;
            setBodyContentHeight(height);
          }
        }}
        onChangeText={onBodyChange}
        onContentSizeChange={(event) =>
          setBodyContentHeight(Math.ceil(event.nativeEvent.contentSize.height))
        }
        onFocus={() => setBodyFocused(true)}
        placeholder={composerPlaceholder}
        scrollEnabled={surface === 'rail' && bodyContentHeight > railBodyMaxHeight}
        style={[
          styles.body,
          hasTrailingContent
            ? styles.trailingContentBody
            : items.length > 0
              ? styles.mediaBody
              : styles.textBody,
          surface === 'rail' ? styles.railBody : null,
          surface === 'overlay' && items.length === 0 && !hasTrailingContent
            ? styles.overlayTextBody
            : null,
          bodyContentHeight > 0 ? { height: bodyContentHeight } : null,
          { backgroundColor: theme.backgroundElevated, color: theme.foregroundPrimary },
          composerBodyFocusStyle,
        ]}
        value={body}
      />
      {children}
      {surface === 'overlay' ? mediaGallery : null}
    </View>
  );
  const visibilityControl = (
    <View
      ref={controlRef}
      style={[
        styles.visibilityControl,
        surface === 'overlay' ? styles.overlayVisibilityControl : null,
      ]}
    >
      <Pressable
        ref={triggerRef}
        aria-expanded={visibilityOpen && !submitting}
        accessibilityLabel={`공개 범위: ${selectedVisibility.label}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: visibilityOpen && !submitting }}
        disabled={submitting}
        onPress={() => setVisibilityOpen((open) => !open)}
        style={({ pressed }) =>
          surface === 'overlay'
            ? [
                styles.mobileVisibility,
                {
                  backgroundColor: pressed ? theme.statePressed : theme.backgroundElevated,
                  borderColor: theme.borderSubtle,
                },
              ]
            : [
                styles.visibilityTrigger,
                {
                  backgroundColor: pressed ? theme.statePressed : theme.backgroundSurface,
                  borderColor: theme.borderDefault,
                },
              ]
        }
      >
        {surface === 'overlay' ? (
          <>
            <Text style={[styles.mobileVisibilityCaption, { color: theme.foregroundSecondary }]}>
              공개 범위
            </Text>
            <View style={styles.mobileVisibilityValue}>
              <Text style={[styles.visibilityOptionLabel, { color: theme.foregroundPrimary }]}>
                {selectedVisibility.label}
              </Text>
              <ChevronDownIcon
                color={theme.foregroundPrimary}
                size={iconSizes[16]}
                strokeWidth={2}
              />
            </View>
          </>
        ) : (
          <>
            <SelectedVisibilityIcon
              color={theme.foregroundPrimary}
              size={iconSizes[16]}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
              style={[styles.visibilityLabel, { color: theme.foregroundPrimary }]}
            >
              {selectedVisibility.label}
            </Text>
          </>
        )}
      </Pressable>
      {visibilityOpen && !submitting ? (
        <VisibilityMenu
          alignRight={surface === 'overlay'}
          openAbove={surface === 'overlay'}
          menuRef={menuRef}
          triggerRef={triggerRef}
          onDismiss={() => setVisibilityOpen(false)}
          onChange={(value) => {
            onVisibilityChange(value);
            setVisibilityOpen(false);
            triggerRef.current?.focus();
          }}
          value={visibility}
        />
      ) : null}
    </View>
  );
  const editorFooter = (
    <View
      style={[
        styles.footer,
        surface === 'overlay' ? styles.overlayFooter : null,
        {
          backgroundColor: theme.backgroundElevated,
          borderTopColor: theme.borderSubtle,
          borderTopWidth: surface === 'overlay' ? borderWidths[0] : borderWidths[1],
        },
      ]}
      testID="post-composer-footer"
    >
      <View style={styles.tools}>
        {showMediaAction ? (
          <ComposerTool
            accessibilityLabel={`이미지 추가, ${4 - items.length}개 더 선택 가능`}
            disabled={submitting}
            onPress={onMediaAction}
          >
            <ImagePlusIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
          </ComposerTool>
        ) : null}
        {showPollAction ? (
          <ComposerTool accessibilityLabel="투표 추가" disabled={submitting} onPress={onPollAction}>
            <ChartNoAxesColumnIncreasingIcon
              color={theme.foregroundPrimary}
              size={iconSizes[20]}
              strokeWidth={2}
            />
          </ComposerTool>
        ) : null}
        {showCWAction ? (
          <ComposerTool
            accessibilityLabel={`콘텐츠 경고 ${contentWarningExpanded ? '끄기' : '켜기'}`}
            disabled={submitting}
            onPress={onContentWarningToggle}
            selected={contentWarningExpanded}
          >
            <TriangleAlertIcon
              color={theme.foregroundPrimary}
              size={iconSizes[20]}
              strokeWidth={2}
            />
          </ComposerTool>
        ) : null}
        {showEmojiAction ? (
          <ComposerTool
            accessibilityLabel="이모지 추가"
            disabled={submitting}
            onPress={onEmojiAction}
          >
            <SmileIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
          </ComposerTool>
        ) : null}
      </View>
      <View style={styles.submit}>
        <Text
          accessibilityRole={'status' as never}
          accessibilityLabel={`남은 글자 수 ${remaining.toLocaleString('ko-KR')}자`}
          accessibilityLiveRegion="polite"
          style={[
            styles.remaining,
            {
              color: remaining < 0 ? theme.feedbackDangerOnSubtle : theme.foregroundSecondary,
            },
          ]}
        >
          {remaining.toLocaleString('ko-KR')}
        </Text>
        <Text nativeID={remainingDescriptionId} style={styles.remainingDescription}>
          남은 글자 수 {remaining.toLocaleString('ko-KR')}자
        </Text>
        {surface === 'overlay' ? <ProgressRing remaining={remaining} /> : null}
        {showSubmit ? (
          <Button
            accessibilityLabel={
              mode === 'post'
                ? undefined
                : submitting
                  ? '게시 중'
                  : mode === 'reply'
                    ? '답글 게시'
                    : '인용 게시'
            }
            disabled={disabled}
            loading={submitting}
            loadingText={mode === 'post' ? undefined : '게시 중'}
            onPress={onSubmit}
            size="compact"
          >
            {copy.submit}
          </Button>
        ) : null}
      </View>
    </View>
  );
  const editor = (
    <View
      style={[
        styles.editor,
        styles.desktopEditor,
        surface === 'overlay' ? styles.overlayEditor : null,
        {
          backgroundColor: theme.backgroundElevated,
          borderColor: surface === 'rail' && bodyFocused ? theme.primary : theme.borderDefault,
        },
      ]}
      testID="post-composer-editor"
    >
      <View style={[styles.header, surface === 'overlay' ? styles.overlayHeader : null]}>
        {surface === 'overlay' ? (
          <View style={styles.overlayAuthor} testID="post-composer-author">
            {author}
          </View>
        ) : null}
        {surface === 'rail' ? visibilityControl : null}
        {surface === 'rail' ? (
          <IconButton
            accessibilityLabel="Composer 확장"
            controlRef={expandControlRef}
            disabled={submitting}
            feedback="opacity"
            onPress={onExpand}
            targetSize={40}
            visualSize={40}
          >
            <ExpandIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
          </IconButton>
        ) : null}
      </View>

      {contentWarningExpanded ? (
        <View style={styles.contentWarning}>
          <TextField
            accessibilityLabel="콘텐츠 경고"
            editable={!submitting}
            onChangeText={onContentWarningChange}
            placeholder="경고 문구를 입력하세요"
            style={[styles.contentWarningField, composerFieldFocusStyle]}
            value={contentWarning}
          />
        </View>
      ) : null}

      {unifiedOverlayScroll ? (
        <View style={styles.desktopScroll}>{editorContent}</View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
          style={[
            styles.desktopScroll,
            Platform.OS === 'web' ? webScrollbarStyle(theme.borderStrong, false) : null,
          ]}
          testID="post-composer-scroll"
        >
          {editorContent}
        </ScrollView>
      )}

      {surface === 'rail' && items.length > 0 ? (
        <View style={styles.railMedia}>{mediaGallery}</View>
      ) : null}

      {unifiedOverlayScroll ? null : editorFooter}
    </View>
  );

  return (
    <View
      accessibilityLabel={copy.title}
      style={[
        styles.root,
        surface === 'rail' ? styles.rail : styles.overlay,
        surface === 'overlay' ? styles.overlayRoot : null,
        surface === 'overlay' && Platform.OS === 'web' ? styles.webOverlay : null,
        { backgroundColor: theme.backgroundCanvas },
      ]}
      testID="post-composer-target"
    >
      {unifiedOverlayScroll ? (
        <>
          <ScrollView
            contentContainerStyle={styles.overlayScrollContent}
            keyboardShouldPersistTaps="handled"
            style={[
              styles.overlayScroll,
              Platform.OS === 'web' ? webScrollbarStyle(theme.borderStrong, true) : null,
            ]}
            testID="post-composer-scroll"
          >
            {beforeEditor}
            {editor}
          </ScrollView>
          {visibilityControl}
          {editorFooter}
        </>
      ) : (
        <>
          {beforeEditor}
          <View style={styles.authorLayer}>{author}</View>
          {editor}
        </>
      )}
    </View>
  );
}

export function MobileFullscreenComposerShellCandidate({
  author,
  beforeEditor,
  body,
  bodyRef,
  children,
  contentWarning,
  contentWarningExpanded,
  fillContainer = false,
  items,
  keyboard = false,
  onBodyChange,
  onContentWarningChange,
  onContentWarningToggle,
  onEmojiAction,
  onMediaAction,
  onMediaEdit,
  onMediaRemove,
  onMediaRetry,
  onOverlayClose,
  onPollAction,
  onSubmit,
  onVisibilityChange,
  remaining,
  sensitiveMedia,
  showCWAction = true,
  showEmojiAction = true,
  showMediaAction = true,
  showPollAction = true,
  submitting = false,
  mode = 'post',
  visibility,
}: MobileFullscreenComposerShellCandidateProps) {
  const theme = useTheme();
  const copy = composerCopy[mode];
  const remainingDescriptionId = useId();
  const bodyInputRef = useRef<TextInput>(null);
  const [bodyContentHeight, setBodyContentHeight] = useState(0);
  const hasTrailingContent = children !== undefined && children !== null;
  const shouldAutoSizeBody = Platform.OS === 'web' && (hasTrailingContent || mode === 'reply');
  const bodyUsesTrailingContentLayout =
    hasTrailingContent || (shouldAutoSizeBody && bodyContentHeight > 0);
  const webReplyShellStyle =
    Platform.OS === 'web' && mode === 'reply'
      ? ({ overflow: 'clip' } as unknown as ViewStyle)
      : null;
  const { controlRef, menuRef, setVisibilityOpen, triggerRef, visibilityOpen } = useVisibilityMenu(
    submitting,
    onVisibilityChange,
  );
  useEffect(() => {
    if (!shouldAutoSizeBody || bodyContentHeight > 0) {
      return;
    }
    const input = (bodyRef ?? bodyInputRef).current as unknown as HTMLTextAreaElement | null;
    if (!input) {
      return;
    }
    const availableHeight = input.clientHeight;
    input.style.height = '0px';
    const height = input.scrollHeight;
    const overflowing = height > availableHeight;
    input.style.height = overflowing ? `${height}px` : 'auto';
    setBodyContentHeight(overflowing ? height : 0);
  }, [body, bodyContentHeight, bodyRef, shouldAutoSizeBody]);
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const disabled =
    submitting ||
    items.some((item) => item.state !== 'ready') ||
    (body.trim().length === 0 && items.length === 0) ||
    remaining < 0;
  return (
    <View
      accessibilityLabel={copy.title}
      style={[
        styles.mobileShell,
        fillContainer ? styles.mobileShellFill : null,
        webReplyShellStyle,
        { backgroundColor: theme.backgroundCanvas },
      ]}
      testID="mobile-fullscreen-composer-candidate"
    >
      <View style={[styles.mobileHeader, { borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.mobileLeadingSlot}>
          <IconButton
            accessibilityLabel={`${copy.title} 닫기`}
            disabled={submitting}
            feedback="opacity"
            onPress={onOverlayClose}
            targetSize={44}
          >
            <XIcon color={theme.foregroundPrimary} size={iconSizes[24]} strokeWidth={2} />
          </IconButton>
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.mobileTitle, { color: theme.foregroundPrimary }]}
        >
          {copy.title}
        </Text>
        <View style={styles.mobileTrailingSlot}>
          <Button
            accessibilityLabel={submitting && mode !== 'post' ? '게시 중' : undefined}
            disabled={disabled}
            loading={submitting}
            loadingText={mode === 'post' ? undefined : '게시 중'}
            onPress={onSubmit}
            style={styles.mobileSubmitButton}
          >
            {copy.submit}
          </Button>
        </View>
      </View>

      <View ref={controlRef} style={styles.mobileVisibilityControl}>
        <Pressable
          ref={triggerRef}
          aria-expanded={visibilityOpen && !submitting}
          accessibilityLabel={`공개 범위: ${selectedVisibility.label}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: visibilityOpen && !submitting }}
          disabled={submitting}
          onPress={() => setVisibilityOpen((open) => !open)}
          style={({ pressed }) => [
            styles.mobileVisibility,
            {
              backgroundColor: pressed ? theme.statePressed : theme.backgroundCanvas,
              borderColor: theme.borderSubtle,
            },
          ]}
        >
          <Text style={[styles.mobileVisibilityCaption, { color: theme.foregroundSecondary }]}>
            공개 범위
          </Text>
          <View style={styles.mobileVisibilityValue}>
            <Text style={[styles.visibilityOptionLabel, { color: theme.foregroundPrimary }]}>
              {selectedVisibility.label}
            </Text>
            <ChevronDownIcon color={theme.foregroundPrimary} size={iconSizes[16]} strokeWidth={2} />
          </View>
        </Pressable>
        {visibilityOpen && !submitting ? (
          <VisibilityMenu
            alignRight
            menuRef={menuRef}
            triggerRef={triggerRef}
            onDismiss={() => setVisibilityOpen(false)}
            onChange={(value) => {
              onVisibilityChange(value);
              setVisibilityOpen(false);
              triggerRef.current?.focus();
            }}
            value={visibility}
          />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.mobileScrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.mobileScroll}
        testID="mobile-fullscreen-composer-scroll"
      >
        <View style={styles.mobileComposerBody} testID="mobile-composer-body">
          {beforeEditor}
          <View style={styles.authorLayer}>{author}</View>
          {contentWarningExpanded ? (
            <TextField
              accessibilityLabel="콘텐츠 경고"
              editable={!submitting}
              onChangeText={onContentWarningChange}
              placeholder="경고 문구를 입력하세요"
              style={[styles.mobileContentWarning, composerFieldFocusStyle]}
              value={contentWarning}
            />
          ) : null}
          <TextInput
            ref={bodyRef ?? bodyInputRef}
            aria-describedby={Platform.OS === 'web' ? remainingDescriptionId : undefined}
            accessibilityLabel={copy.bodyLabel}
            editable={!submitting}
            multiline
            onChange={(event) => {
              if (shouldAutoSizeBody) {
                const input = event.currentTarget as unknown as HTMLTextAreaElement;
                const availableHeight = input.clientHeight;
                input.style.height = '0px';
                const height = input.scrollHeight;
                const overflowing = height > availableHeight;
                input.style.height = overflowing ? `${height}px` : 'auto';
                setBodyContentHeight(overflowing ? height : 0);
              }
            }}
            onChangeText={onBodyChange}
            onContentSizeChange={(event) =>
              hasTrailingContent &&
              setBodyContentHeight(Math.ceil(event.nativeEvent.contentSize.height))
            }
            placeholder={composerPlaceholder}
            placeholderTextColor={
              submitting ? theme.stateDisabledForeground : theme.foregroundMuted
            }
            style={[
              styles.mobileBody,
              bodyUsesTrailingContentLayout ? styles.mobileTrailingContentBody : null,
              bodyUsesTrailingContentLayout && bodyContentHeight > 0
                ? { height: bodyContentHeight }
                : null,
              {
                backgroundColor: theme.backgroundCanvas,
                color: theme.foregroundPrimary,
                ...composerBodyFocusStyle,
              },
            ]}
            value={body}
          />
          {children}
        </View>

        {items.length > 0 ? (
          <View style={styles.mobileMediaShelf} testID="mobile-composer-media-shelf">
            <PostComposerMediaItemsTarget
              disabled={submitting}
              media={items}
              onEdit={onMediaEdit}
              onRemove={onMediaRemove}
              onRetry={(item) => onMediaRetry(item.key)}
              sensitiveMedia={sensitiveMedia}
            />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[styles.mobileFooter, { borderTopColor: theme.borderSubtle }]}
        testID="mobile-composer-footer"
      >
        <View style={styles.tools}>
          {showMediaAction ? (
            <ComposerTool
              accessibilityLabel={`이미지 추가, ${4 - items.length}개 더 선택 가능`}
              disabled={submitting}
              onPress={onMediaAction}
            >
              <ImagePlusIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
            </ComposerTool>
          ) : null}
          {showPollAction ? (
            <ComposerTool
              accessibilityLabel="투표 추가"
              disabled={submitting}
              onPress={onPollAction}
            >
              <ChartNoAxesColumnIncreasingIcon
                color={theme.foregroundPrimary}
                size={iconSizes[20]}
                strokeWidth={2}
              />
            </ComposerTool>
          ) : null}
          {showCWAction ? (
            <ComposerTool
              accessibilityLabel={`콘텐츠 경고 ${contentWarningExpanded ? '끄기' : '켜기'}`}
              disabled={submitting}
              onPress={onContentWarningToggle}
              selected={contentWarningExpanded}
            >
              <TriangleAlertIcon
                color={theme.foregroundPrimary}
                size={iconSizes[20]}
                strokeWidth={2}
              />
            </ComposerTool>
          ) : null}
          {showEmojiAction ? (
            <ComposerTool
              accessibilityLabel="이모지 추가"
              disabled={submitting}
              onPress={onEmojiAction}
            >
              <SmileIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
            </ComposerTool>
          ) : null}
        </View>
        <View style={styles.submit}>
          <Text
            accessibilityRole={'status' as never}
            accessibilityLabel={`남은 글자 수 ${remaining.toLocaleString('ko-KR')}자`}
            accessibilityLiveRegion="polite"
            style={[
              styles.remaining,
              { color: remaining < 0 ? theme.feedbackDangerOnSubtle : theme.foregroundSecondary },
            ]}
          >
            {remaining.toLocaleString('ko-KR')}
          </Text>
          <Text nativeID={remainingDescriptionId} style={styles.remainingDescription}>
            남은 글자 수 {remaining.toLocaleString('ko-KR')}자
          </Text>
          <ProgressRing remaining={remaining} />
        </View>
      </View>
      {keyboard ? <IllustrativeKeyboard /> : null}
    </View>
  );
}

function ProgressRing({ remaining }: { remaining: number }) {
  const theme = useTheme();
  const usedRatio = Math.min(1, Math.max(0, (postBodyMaxLength - remaining) / postBodyMaxLength));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const color =
    remaining <= 0
      ? theme.feedbackDangerBorder
      : remaining <= 100
        ? theme.feedbackWarningBorder
        : theme.stateSelectedBorder;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.progressRing}
      testID="post-composer-progress-ring"
    >
      <Svg height={20} viewBox="0 0 20 20" width={20}>
        <Circle
          cx={10}
          cy={10}
          fill="none"
          r={radius}
          stroke={theme.borderSubtle}
          strokeWidth={2}
        />
        <Circle
          cx={10}
          cy={10}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={circumference * (1 - usedRatio)}
          strokeLinecap="round"
          strokeWidth={2}
          transform="rotate(-90 10 10)"
        />
      </Svg>
    </View>
  );
}

function IllustrativeKeyboard() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.keyboard,
        { backgroundColor: theme.backgroundSurface, borderColor: theme.borderSubtle },
      ]}
      testID="illustrative-system-keyboard"
    >
      {[342, 326, 286, 168].map((width) => (
        <View
          key={width}
          style={[
            styles.keyboardRow,
            { backgroundColor: theme.backgroundElevated, borderColor: theme.borderSubtle, width },
          ]}
        />
      ))}
    </View>
  );
}

function VisibilityMenu({
  alignRight = false,
  openAbove = false,
  menuRef,
  onChange,
  onDismiss,
  triggerRef,
  value,
}: {
  alignRight?: boolean;
  openAbove?: boolean;
  menuRef: RefObject<View | null>;
  onChange: (value: PostComposerVisibility) => void;
  onDismiss: () => void;
  triggerRef: RefObject<View | null>;
  value: PostComposerVisibility;
}) {
  const theme = useTheme();
  const elevation = useElevation();
  const { height, width } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const dismiss = () => {
    onDismiss();
    triggerRef.current?.focus();
  };
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    triggerRef.current?.measureInWindow((x, y, triggerWidth, triggerHeight) => {
      setAnchor({
        left: Math.max(
          0,
          Math.min(
            alignRight ? x + triggerWidth - 240 - space[16] : x,
            width - 240 - (alignRight ? space[16] : 0),
          ),
        ),
        top: Math.max(space[16], Math.min(y + triggerHeight + space[4], height - 64)),
      });
    });
  }, [alignRight, height, triggerRef, width]);
  const menu = (
    <View
      ref={menuRef}
      accessibilityLabel="공개 범위 선택"
      accessibilityRole={Platform.OS === 'web' ? undefined : 'radiogroup'}
      role={Platform.OS === 'web' ? 'menu' : undefined}
      style={[
        styles.visibilityMenu,
        Platform.OS === 'web'
          ? alignRight
            ? styles.visibilityMenuRight
            : styles.visibilityMenuLeft
          : styles.nativeVisibilityMenu,
        Platform.OS === 'web' && openAbove ? styles.visibilityMenuAbove : null,
        elevation.floating,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
      ]}
    >
      {visibilityOptions.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <Pressable
            aria-checked={selected}
            accessibilityLabel={option.label}
            accessibilityRole={Platform.OS === 'web' ? undefined : 'radio'}
            accessibilityState={{ checked: selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            role={Platform.OS === 'web' ? ('menuitemradio' as never) : undefined}
            style={({ pressed }) => [
              styles.visibilityOption,
              {
                backgroundColor: selected
                  ? theme.stateSelectedSurface
                  : pressed
                    ? theme.statePressed
                    : 'transparent',
              },
            ]}
          >
            <Icon color={theme.foregroundSecondary} size={iconSizes[16]} strokeWidth={2} />
            <View style={styles.visibilityOptionCopy}>
              <Text style={[styles.visibilityOptionLabel, { color: theme.foregroundPrimary }]}>
                {option.label}
              </Text>
              <Text style={[styles.visibilityDescription, { color: theme.foregroundSecondary }]}>
                {option.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
  return Platform.OS === 'web' ? (
    menu
  ) : (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.visibilityBackdrop}>
        <Pressable accessible={false} onPress={dismiss} style={StyleSheet.absoluteFill} />
        {anchor ? (
          <ScrollView
            accessibilityViewIsModal
            onAccessibilityEscape={dismiss}
            keyboardShouldPersistTaps="handled"
            style={[
              styles.nativeVisibilityPosition,
              anchor,
              { maxHeight: Math.max(0, height - anchor.top - space[16]) },
            ]}
          >
            {menu}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

export function ComposerTool({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  selected,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled: boolean;
  onPress: () => void;
  selected?: boolean;
}) {
  const theme = useTheme();
  return (
    <IconButton
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      aria-pressed={selected}
      disabled={disabled}
      feedback="opacity"
      onPress={onPress}
      visualSize={32}
      visualStyle={[
        styles.toolVisual,
        { backgroundColor: selected ? theme.stateSelectedSurface : 'transparent' },
      ]}
    >
      {children}
    </IconButton>
  );
}

const styles = StyleSheet.create({
  authorLayer: { position: 'relative', zIndex: 20 },
  body: { borderWidth: borderWidths[0], padding: space[0] },
  content: { gap: space[12], paddingHorizontal: space[12] },
  contentWarning: { paddingBottom: space[12] },
  contentWarningField: { borderRadius: radius[0] },
  editor: { borderRadius: radius[12], borderWidth: borderWidths[1], overflow: 'visible' },
  overlayAuthor: { flex: 1, minWidth: 0 },
  overlayContent: { minHeight: 0 },
  overlayEditor: { borderWidth: borderWidths[0] },
  overlayFooter: { borderTopWidth: borderWidths[1], marginHorizontal: -space[16] },
  overlayHeader: { paddingHorizontal: space[0] },
  overlayRoot: { gap: space[0], paddingBottom: space[0] },
  overlayVisibilityControl: { marginHorizontal: -space[16] },
  overlayTextBody: { minHeight: 80 },
  footer: {
    alignItems: 'center',
    borderBottomLeftRadius: radius[12],
    borderBottomRightRadius: radius[12],
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-between',
    padding: space[12],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-between',
    padding: space[12],
    zIndex: 10,
  },
  mediaBody: { minHeight: 100 },
  mobileBody: {
    borderRadius: radius[12],
    borderWidth: borderWidths[0],
    flex: 1,
    minHeight: 80,
    padding: space[0],
    textAlignVertical: 'top',
    ...textStyles.contentM,
  },
  mobileTrailingContentBody: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 44,
  },
  mobileComposerBody: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 160,
    gap: space[8],
    overflow: 'visible',
    paddingBottom: space[8],
    paddingHorizontal: space[16],
    paddingTop: space[16],
  },
  mobileContentWarning: { borderRadius: radius[0], minHeight: 44 },
  mobileScroll: { flex: 1, minHeight: 0 },
  mobileScrollContent: { flexGrow: 1 },
  mobileFooter: {
    alignItems: 'center',
    borderTopWidth: borderWidths[1],
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-between',
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
  mobileHeader: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    height: 64,
    paddingHorizontal: space[16],
  },
  mobileLeadingSlot: { alignItems: 'flex-start', width: 72 },
  mobileMediaShelf: { height: 164, paddingBottom: space[8], paddingHorizontal: space[16] },
  mobileShell: { height: 844, overflow: 'hidden', width: 390 },
  mobileShellFill: { flex: 1, height: '100%', width: '100%' },
  mobileSubmitButton: { minWidth: 72, width: 72 },
  mobileTitle: { flex: 1, textAlign: 'center', ...textStyles.uiHeadingS },
  mobileTrailingSlot: { alignItems: 'flex-end', width: 84 },
  mobileVisibilityControl: { position: 'relative', zIndex: 12 },
  mobileVisibility: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    borderTopWidth: borderWidths[1],
    flexDirection: 'row',
    height: 48,
    justifyContent: 'space-between',
    paddingHorizontal: space[16],
  },
  mobileVisibilityCaption: textStyles.uiCopyM,
  mobileVisibilityValue: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  keyboard: {
    alignItems: 'center',
    borderTopWidth: borderWidths[1],
    gap: space[12],
    height: 336,
    justifyContent: 'center',
  },
  keyboardRow: { borderRadius: radius[8], borderWidth: borderWidths[1], height: 44 },
  desktopEditor: { flexShrink: 1, minHeight: 0 },
  desktopScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  overlay: { flexShrink: 1, maxWidth: 640, minHeight: 0, width: '100%' },
  overlayScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  overlayScrollContent: { gap: space[16], paddingBottom: space[16] },
  progressRing: { height: 20, width: 20 },
  rail: { width: '100%' },
  railBody: { maxHeight: railBodyMaxHeight },
  railMedia: { paddingBottom: space[12], paddingHorizontal: space[12], paddingTop: space[12] },
  remaining: { width: 40, ...textStyles.uiCopyS, textAlign: 'right' },
  remainingDescription: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  root: { gap: space[16], padding: space[16] },
  submit: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  textBody: { minHeight: 184 },
  textContent: { minHeight: 184 },
  trailingContentBody: { minHeight: 44 },
  tools: { alignItems: 'center', flexDirection: 'row', gap: space[4] },
  toolVisual: { borderRadius: radius[8] },
  visibilityControl: { position: 'relative', zIndex: 12 },
  visibilityDescription: textStyles.uiCopyS,
  visibilityLabel: { width: 66, ...textStyles.uiLabelM },
  visibilityMenu: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    overflow: 'hidden',
    position: 'absolute',
    top: 44,
    width: 240,
  },
  visibilityMenuAbove: { bottom: 48, top: 'auto' },
  visibilityMenuLeft: { left: 0 },
  visibilityMenuRight: { right: space[16] },
  webOverlay: { maxHeight: 'calc(100dvh - 160px)' as never },
  nativeVisibilityMenu: { position: 'relative', top: 0 },
  nativeVisibilityPosition: { position: 'absolute', width: 240 },
  visibilityBackdrop: { flex: 1 },
  visibilityOption: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space[8],
    padding: space[12],
  },
  visibilityOptionCopy: { flex: 1 },
  visibilityOptionLabel: textStyles.uiLabelM,
  visibilityTrigger: {
    alignItems: 'center',
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[4],
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: space[16],
    width: 120,
  },
});
