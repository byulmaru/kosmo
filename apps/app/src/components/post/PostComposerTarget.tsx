import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import {
  ChartNoAxesColumnIncreasingIcon,
  ChevronDownIcon,
  ExpandIcon,
  GlobeIcon,
  ImagePlusIcon,
  LockIcon,
  MoonIcon,
  SmileIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
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
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { PostComposerMediaItemsTarget } from './PostComposerMediaItemsTarget';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode, RefObject } from 'react';
import type { TextStyle } from 'react-native';
import type { ComposerMediaItem } from './PostComposerMediaControls';

export type PostComposerTargetVisibility = 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';

export type PostComposerTargetProps = Readonly<{
  author: ReactNode;
  body: string;
  bodyRef?: RefObject<TextInput | null>;
  contentWarning: string;
  contentWarningExpanded: boolean;
  error?: string;
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
  onVisibilityChange: (value: PostComposerTargetVisibility) => void;
  remaining: number;
  sensitiveMedia: boolean;
  showCWAction?: boolean;
  showEmojiAction?: boolean;
  showMediaAction?: boolean;
  showPollAction?: boolean;
  showSubmit?: boolean;
  submitting?: boolean;
  surface: 'overlay' | 'rail';
  visibility: PostComposerTargetVisibility;
}>;

export type MobileFullscreenComposerShellCandidateProps = Omit<
  PostComposerTargetProps,
  'onExpand' | 'showSubmit' | 'surface'
> &
  Readonly<{ fillContainer?: boolean; keyboard?: boolean; onOverlayClose: () => void }>;

const visibilityOptions: ReadonlyArray<{
  description: string;
  icon: LucideIcon;
  label: string;
  value: PostComposerTargetVisibility;
}> = [
  { description: '모두가 볼 수 있어요.', icon: GlobeIcon, label: '공개', value: 'PUBLIC' },
  {
    description: '모두가 볼 수 있지만 검색되지 않아요.',
    icon: MoonIcon,
    label: '조용한 공개',
    value: 'UNLISTED',
  },
  { description: '팔로워만 볼 수 있어요.', icon: LockIcon, label: '팔로워만', value: 'FOLLOWERS' },
];

const composerBodyFocusStyle = {
  borderWidth: borderWidths[0],
  outlineStyle: 'solid',
  outlineWidth: 0,
} as unknown as TextStyle;
const composerFieldFocusStyle = {
  borderWidth: borderWidths[1],
  outlineWidth: 0,
} as unknown as TextStyle;

function useVisibilityMenu(
  submitting: boolean,
  onVisibilityChange: PostComposerTargetProps['onVisibilityChange'],
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
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="radio"]'));
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

export function PostComposerTarget({
  author,
  body,
  bodyRef,
  contentWarning,
  contentWarningExpanded,
  error,
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
  surface,
  visibility,
}: PostComposerTargetProps) {
  const theme = useTheme();
  const { controlRef, menuRef, setVisibilityOpen, triggerRef, visibilityOpen } = useVisibilityMenu(
    submitting,
    onVisibilityChange,
  );
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const SelectedVisibilityIcon = selectedVisibility.icon;
  const disabled =
    submitting ||
    items.some((item) => item.state !== 'ready') ||
    (body.trim().length === 0 && items.length === 0) ||
    remaining < 0;
  const editorBody = (
    <>
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

      <View style={[styles.content, items.length > 0 ? styles.mediaContent : styles.textContent]}>
        <TextArea
          accessibilityLabel="게시물 내용"
          editable={!submitting}
          ref={bodyRef}
          onChangeText={onBodyChange}
          placeholder="무슨 일이 일어나고 있나요?"
          style={[
            styles.body,
            items.length > 0 ? styles.mediaBody : styles.textBody,
            surface === 'overlay' && items.length > 0 ? styles.overlayMediaBody : null,
            { backgroundColor: theme.backgroundElevated, color: theme.foregroundPrimary },
            composerBodyFocusStyle,
          ]}
          value={body}
        />
        <PostComposerMediaItemsTarget
          disabled={submitting}
          media={items}
          onEdit={onMediaEdit}
          onRemove={onMediaRemove}
          onRetry={(item) => onMediaRetry(item.key)}
          sensitiveMedia={sensitiveMedia}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: theme.feedbackDangerOnSubtle }]}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      accessibilityLabel="게시물 작성"
      style={[
        styles.root,
        surface === 'rail' ? styles.rail : styles.overlay,
        surface === 'overlay' && Platform.OS === 'web' ? styles.webOverlay : null,
        { backgroundColor: theme.backgroundCanvas },
      ]}
      testID="post-composer-target"
    >
      {author}
      <View
        style={[
          styles.editor,
          surface === 'overlay' ? styles.overlayEditor : null,
          {
            backgroundColor: theme.backgroundElevated,
            borderColor: error ? theme.feedbackDangerBorder : theme.borderDefault,
          },
        ]}
      >
        <View style={styles.header}>
          <View ref={controlRef} style={styles.visibilityControl}>
            <Pressable
              ref={triggerRef}
              aria-expanded={visibilityOpen && !submitting}
              accessibilityLabel={`공개 범위: ${selectedVisibility.label}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: visibilityOpen && !submitting }}
              disabled={submitting}
              onPress={() => setVisibilityOpen((open) => !open)}
              style={({ pressed }) => [
                styles.visibilityTrigger,
                {
                  backgroundColor: pressed ? theme.statePressed : theme.backgroundSurface,
                  borderColor: theme.borderDefault,
                },
              ]}
            >
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
            </Pressable>
            {visibilityOpen && !submitting ? (
              <VisibilityMenu
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
          {surface === 'rail' ? (
            <IconButton
              accessibilityLabel="Composer 확장"
              controlRef={expandControlRef}
              disabled={submitting}
              feedback="opacity"
              onPress={onExpand}
              targetSize={40}
              visualSize={32}
            >
              <ExpandIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
            </IconButton>
          ) : null}
        </View>

        {surface === 'overlay' ? (
          <ScrollView
            contentContainerStyle={styles.overlayScrollContent}
            keyboardShouldPersistTaps="handled"
            style={styles.overlayScroll}
            testID="post-composer-overlay-scroll"
          >
            {editorBody}
          </ScrollView>
        ) : (
          editorBody
        )}

        <View style={styles.footer}>
          <View style={styles.tools}>
            {showMediaAction ? (
              <ComposerTool
                accessibilityLabel="이미지 추가"
                disabled={submitting}
                onPress={onMediaAction}
              >
                <ImagePlusIcon
                  color={theme.foregroundPrimary}
                  size={iconSizes[20]}
                  strokeWidth={2}
                />
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
            {surface === 'overlay' ? <ProgressRing remaining={remaining} /> : null}
            {showSubmit ? (
              <Button disabled={disabled} loading={submitting} onPress={onSubmit} size="compact">
                게시
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

export function MobileFullscreenComposerShellCandidate({
  author,
  body,
  bodyRef,
  contentWarning,
  contentWarningExpanded,
  error,
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
  visibility,
}: MobileFullscreenComposerShellCandidateProps) {
  const theme = useTheme();
  const { controlRef, menuRef, setVisibilityOpen, triggerRef, visibilityOpen } = useVisibilityMenu(
    submitting,
    onVisibilityChange,
  );
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const disabled =
    submitting ||
    items.some((item) => item.state !== 'ready') ||
    (body.trim().length === 0 && items.length === 0) ||
    remaining < 0;
  return (
    <View
      accessibilityLabel="모바일 글쓰기"
      style={[
        styles.mobileShell,
        fillContainer ? styles.mobileShellFill : null,
        { backgroundColor: theme.backgroundCanvas },
      ]}
      testID="mobile-fullscreen-composer-candidate"
    >
      <View style={[styles.mobileHeader, { borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.mobileLeadingSlot}>
          <IconButton
            accessibilityLabel="글쓰기 닫기"
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
          글쓰기
        </Text>
        <View style={styles.mobileTrailingSlot}>
          <Button
            disabled={disabled}
            loading={submitting}
            onPress={onSubmit}
            style={styles.mobileSubmitButton}
          >
            게시
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
      >
        <View style={styles.mobileComposerBody} testID="mobile-composer-body">
          {author}
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
            ref={bodyRef}
            accessibilityLabel="게시물 내용"
            editable={!submitting}
            multiline
            onChangeText={onBodyChange}
            placeholder="무슨 일이 일어나고 있나요?"
            placeholderTextColor={
              submitting ? theme.stateDisabledForeground : theme.foregroundMuted
            }
            style={[
              styles.mobileBody,
              {
                backgroundColor: theme.backgroundCanvas,
                color: theme.foregroundPrimary,
                ...composerBodyFocusStyle,
              },
            ]}
            value={body}
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.feedbackDangerOnSubtle }]}
            >
              {error}
            </Text>
          ) : null}
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
              accessibilityLabel="이미지 추가"
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
            accessibilityLabel={`남은 글자 수 ${remaining.toLocaleString('ko-KR')}자`}
            accessibilityLiveRegion="polite"
            style={[
              styles.remaining,
              { color: remaining < 0 ? theme.feedbackDangerOnSubtle : theme.foregroundSecondary },
            ]}
          >
            {remaining.toLocaleString('ko-KR')}
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
  menuRef,
  onChange,
  onDismiss,
  triggerRef,
  value,
}: {
  alignRight?: boolean;
  menuRef: RefObject<View | null>;
  onChange: (value: PostComposerTargetVisibility) => void;
  onDismiss: () => void;
  triggerRef: RefObject<View | null>;
  value: PostComposerTargetVisibility;
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
        left: Math.max(0, Math.min(alignRight ? x + triggerWidth - 240 : x, width - 240)),
        top: Math.max(space[16], Math.min(y + triggerHeight + space[4], height - 64)),
      });
    });
  }, [alignRight, height, triggerRef, width]);
  const menu = (
    <View
      ref={menuRef}
      accessibilityLabel="공개 범위 선택"
      accessibilityRole="radiogroup"
      style={[
        styles.visibilityMenu,
        Platform.OS === 'web'
          ? alignRight
            ? styles.visibilityMenuRight
            : styles.visibilityMenuLeft
          : styles.nativeVisibilityMenu,
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
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
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

function ComposerTool({
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
  body: { borderWidth: borderWidths[0], padding: space[0] },
  content: { gap: space[12], paddingHorizontal: space[12] },
  contentWarning: { paddingBottom: space[12] },
  contentWarningField: { borderRadius: radius[0] },
  editor: { borderRadius: radius[12], borderWidth: borderWidths[1], overflow: 'visible' },
  error: textStyles.uiCopyM,
  footer: {
    alignItems: 'center',
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
  mediaBody: { minHeight: 236 },
  mediaContent: { minHeight: 404 },
  mobileBody: {
    borderRadius: radius[12],
    borderWidth: borderWidths[0],
    flex: 1,
    minHeight: 80,
    padding: space[0],
    textAlignVertical: 'top',
    ...textStyles.contentM,
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
  overlay: { height: 404, maxWidth: 600, width: '100%' },
  overlayEditor: { flex: 1, minHeight: 0 },
  overlayMediaBody: { minHeight: 80 },
  overlayScroll: { flex: 1, minHeight: 0 },
  overlayScrollContent: { minHeight: '100%' },
  progressRing: { height: 20, width: 20 },
  rail: { width: 326 },
  remaining: { width: 40, ...textStyles.uiCopyS, textAlign: 'right' },
  root: { gap: space[16], padding: space[16] },
  submit: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  textBody: { minHeight: 184 },
  textContent: { minHeight: 184 },
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
  visibilityMenuLeft: { left: 0 },
  visibilityMenuRight: { right: 0 },
  webOverlay: { maxHeight: 'calc(85dvh - 64px)' as never },
  nativeVisibilityMenu: { position: 'relative', top: 0 },
  nativeVisibilityPosition: { position: 'absolute', width: 240 },
  visibilityBackdrop: { flex: 1 },
  visibilityOption: {
    alignItems: 'center',
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
