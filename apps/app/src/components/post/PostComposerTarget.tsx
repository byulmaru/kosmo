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
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextArea, TextField } from '@/components/ui/TextField';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { PostComposerMediaItemsTarget } from './PostComposerMediaItemsTarget';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import type { ComposerMediaItem } from './PostComposerMediaControls';

export type PostComposerTargetVisibility = 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';

export type PostComposerTargetProps = Readonly<{
  author: ReactNode;
  body: string;
  contentWarning: string;
  contentWarningExpanded: boolean;
  error?: string;
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
  Readonly<{ keyboard?: boolean; onOverlayClose: () => void }>;

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

export function PostComposerTarget({
  author,
  body,
  contentWarning,
  contentWarningExpanded,
  error,
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
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const SelectedVisibilityIcon = selectedVisibility.icon;
  const disabled =
    submitting ||
    items.some((item) => item.state !== 'ready') ||
    (body.trim().length === 0 && items.length === 0) ||
    remaining < 0;

  return (
    <View
      accessibilityLabel="게시물 작성"
      style={[
        styles.root,
        surface === 'rail' ? styles.rail : styles.overlay,
        { backgroundColor: theme.backgroundCanvas },
      ]}
      testID="post-composer-target"
    >
      {author}
      <View
        style={[
          styles.editor,
          {
            backgroundColor: theme.backgroundElevated,
            borderColor: error ? theme.feedbackDangerBorder : theme.borderDefault,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.visibilityControl}>
            <Pressable
              accessibilityLabel={`공개 범위: ${selectedVisibility.label}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: visibilityOpen }}
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
            {visibilityOpen ? (
              <VisibilityMenu
                onChange={(value) => {
                  onVisibilityChange(value);
                  setVisibilityOpen(false);
                }}
                value={visibility}
              />
            ) : null}
          </View>
          {surface === 'rail' ? (
            <IconButton
              accessibilityLabel="Composer 확장"
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

        {contentWarningExpanded ? (
          <View style={styles.contentWarning}>
            <TextField
              accessibilityLabel="콘텐츠 경고"
              editable={!submitting}
              onChangeText={onContentWarningChange}
              placeholder="경고 문구를 입력하세요"
              style={styles.contentWarningField}
              value={contentWarning}
            />
          </View>
        ) : null}

        <View style={[styles.content, items.length > 0 ? styles.mediaContent : styles.textContent]}>
          <TextArea
            accessibilityLabel="게시물 내용"
            editable={!submitting}
            onChangeText={onBodyChange}
            placeholder="무슨 일이 일어나고 있나요?"
            style={[
              styles.body,
              items.length > 0 ? styles.mediaBody : styles.textBody,
              { backgroundColor: theme.backgroundElevated, color: theme.foregroundPrimary },
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
            {showSubmit ? (
              <Button
                disabled={disabled}
                loading={submitting}
                loadingText="게시 중"
                onPress={onSubmit}
                size="compact"
              >
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
  contentWarning,
  contentWarningExpanded,
  error,
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
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const disabled =
    submitting ||
    items.some((item) => item.state !== 'ready') ||
    (body.trim().length === 0 && items.length === 0) ||
    remaining < 0;
  const textHeight = keyboard
    ? items.length > 0
      ? 100
      : contentWarningExpanded
        ? 216
        : 264
    : items.length > 0
      ? 424
      : contentWarningExpanded
        ? 552
        : 600;

  return (
    <View
      accessibilityLabel="모바일 글쓰기 Candidate"
      style={[styles.mobileShell, { backgroundColor: theme.backgroundCanvas }]}
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
          <Button disabled={disabled} loading={submitting} onPress={onSubmit} size="compact">
            게시
          </Button>
        </View>
      </View>

      <View style={styles.mobileVisibilityControl}>
        <Pressable
          accessibilityLabel={`공개 범위: ${selectedVisibility.label}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: visibilityOpen }}
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
        {visibilityOpen ? (
          <VisibilityMenu
            onChange={(value) => {
              onVisibilityChange(value);
              setVisibilityOpen(false);
            }}
            value={visibility}
          />
        ) : null}
      </View>

      <View style={styles.mobileComposerBody}>
        {author}
        {contentWarningExpanded ? (
          <TextField
            accessibilityLabel="콘텐츠 경고"
            editable={!submitting}
            onChangeText={onContentWarningChange}
            placeholder="경고 문구를 입력하세요"
            style={styles.mobileContentWarning}
            value={contentWarning}
          />
        ) : null}
        <TextArea
          accessibilityLabel="게시물 내용"
          editable={!submitting}
          onChangeText={onBodyChange}
          placeholder="무슨 일이 일어나고 있나요?"
          style={[
            styles.mobileBody,
            {
              backgroundColor: theme.backgroundCanvas,
              color: theme.foregroundPrimary,
              height: textHeight,
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
        <View style={styles.mobileMediaShelf}>
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

      <View style={[styles.mobileFooter, { borderTopColor: theme.borderSubtle }]}>
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
      </View>
      {keyboard ? <IllustrativeKeyboard /> : null}
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
  onChange,
  value,
}: {
  onChange: (value: PostComposerTargetVisibility) => void;
  value: PostComposerTargetVisibility;
}) {
  const theme = useTheme();
  const elevation = useElevation();
  return (
    <View
      accessibilityLabel="공개 범위 선택"
      accessibilityRole="radiogroup"
      style={[
        styles.visibilityMenu,
        elevation.floating,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
      ]}
    >
      {visibilityOptions.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <Pressable
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
}

function ComposerTool({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  selected = false,
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
      accessibilityState={{ selected }}
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
  mobileBody: { borderWidth: borderWidths[0], minHeight: 0, padding: space[0] },
  mobileComposerBody: {
    flex: 1,
    gap: space[4],
    overflow: 'hidden',
    paddingBottom: space[8],
    paddingHorizontal: space[16],
    paddingTop: space[16],
  },
  mobileContentWarning: { borderRadius: radius[0], minHeight: 44 },
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
  overlay: { maxWidth: 600, width: '100%' },
  rail: { width: 326 },
  remaining: { width: 40, ...textStyles.uiCopyS },
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
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 44,
    width: 240,
  },
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
