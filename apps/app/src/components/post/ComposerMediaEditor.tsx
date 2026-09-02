import { ArrowLeftIcon, FlagIcon, SquarePenIcon, XIcon } from 'lucide-react-native';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Tab, TabList } from '@/components/ui/Tabs';
import { TextArea } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { ComposerMediaItem } from './PostComposerMediaControls';

export type ComposerMediaEditorTool = 'alt' | 'sensitive';
export type ComposerMediaEditorMobileState = 'altKeyboard' | 'default' | 'sensitive';

export type ComposerMediaEditorProps = {
  readonly media: readonly ComposerMediaItem[];
  readonly mobileState?: ComposerMediaEditorMobileState;
  readonly onAltTextChange: (key: string, altText: string) => void;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly onSelectMedia: (key: string) => void;
  readonly onSensitiveMediaChange: (value: boolean) => void;
  readonly onToolChange: (tool: ComposerMediaEditorTool) => void;
  readonly presentation: 'mobile' | 'web';
  readonly selectedKey: string;
  readonly sensitiveMedia: boolean;
  readonly tool: ComposerMediaEditorTool;
};

const altTextLimit = 1000;

export function ComposerMediaEditor(props: ComposerMediaEditorProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const selectedIndex = Math.max(
    0,
    props.media.findIndex(({ key }) => key === props.selectedKey),
  );
  const selected = props.media[selectedIndex];
  const mobile = props.presentation === 'mobile';
  const mobileState =
    props.mobileState ?? (props.tool === 'sensitive' ? 'sensitive' : 'altKeyboard');
  const mobileTool =
    mobileState === 'default' ? null : mobileState === 'altKeyboard' ? 'alt' : 'sensitive';

  return (
    <View
      style={[
        styles.root,
        mobile
          ? { height, width: '100%' }
          : { height: 678, maxWidth: 920, minWidth: 720, width: '100%' },
        { backgroundColor: theme.backgroundSurface },
      ]}
      testID={mobile ? 'mobile-composer-media-editor' : 'web-composer-media-editor'}
    >
      <EditorHeader
        mobile={mobile}
        onBack={props.onBack}
        onClose={props.onClose}
        onDone={props.onDone}
      />

      {mobile ? (
        <>
          <MediaGallery
            media={props.media}
            mobile
            onSelectMedia={props.onSelectMedia}
            selectedKey={selected?.key}
          />
          <MediaPreview
            mediaCount={props.media.length}
            selected={selected}
            selectedIndex={selectedIndex}
          />
          <View
            accessibilityLabel="미디어 편집 도구"
            style={[styles.mobileActions, { borderColor: theme.borderSubtle }]}
          >
            <MobileToolButton
              icon={<SquarePenIcon color={theme.foregroundPrimary} size={iconSizes[20]} />}
              label="대체 텍스트 편집"
              onPress={() => props.onToolChange('alt')}
              selected={mobileTool === 'alt'}
            />
            <MobileToolButton
              icon={<FlagIcon color={theme.foregroundPrimary} size={iconSizes[20]} />}
              label="민감도 편집"
              onPress={() => props.onToolChange('sensitive')}
              selected={mobileTool === 'sensitive'}
            />
          </View>
          {mobileTool ? (
            <MobileToolSheet
              {...props}
              selected={selected}
              selectedIndex={selectedIndex}
              tool={mobileTool}
            />
          ) : null}
          {mobileState === 'altKeyboard' ? <IllustrativeKeyboard /> : null}
        </>
      ) : (
        <>
          <EditorTabs onToolChange={props.onToolChange} tool={props.tool} />
          <View style={styles.webBody}>
            <View style={styles.webWorkspace}>
              <MediaPreview
                mediaCount={props.media.length}
                selected={selected}
                selectedIndex={selectedIndex}
              />
              <MediaGallery
                media={props.media}
                onSelectMedia={props.onSelectMedia}
                selectedKey={selected?.key}
              />
            </View>
            <WebToolPanel {...props} selected={selected} selectedIndex={selectedIndex} />
          </View>
          <View style={[styles.footer, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.footerCopy, { color: theme.foregroundSecondary }]}>
              {props.tool === 'sensitive'
                ? '게시물 전체의 민감도 변경 사항을 Composer 초안에 반영합니다.'
                : '선택한 이미지의 변경 사항을 Composer 초안에 반영합니다.'}
            </Text>
            <Button onPress={props.onDone}>완료</Button>
          </View>
        </>
      )}
    </View>
  );
}

function EditorHeader({
  mobile,
  onBack,
  onClose,
  onDone,
}: {
  readonly mobile: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { borderColor: theme.borderSubtle }]}>
      <IconButton
        accessibilityLabel="미디어 편집에서 뒤로"
        feedback="opacity"
        onPress={onBack}
        targetSize={44}
        visualSize={32}
      >
        <ArrowLeftIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
      </IconButton>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foregroundPrimary }]}>
        미디어 편집
      </Text>
      {mobile ? (
        <Pressable
          accessibilityLabel="완료"
          accessibilityRole="button"
          onPress={onDone}
          style={({ pressed }) => [styles.mobileDone, pressed && styles.pressed]}
        >
          <Text style={[styles.mobileDoneLabel, { color: theme.foregroundPrimary }]}>완료</Text>
        </Pressable>
      ) : (
        <IconButton
          accessibilityLabel="미디어 편집 닫기"
          feedback="opacity"
          onPress={onClose}
          targetSize={44}
          visualSize={32}
        >
          <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
        </IconButton>
      )}
    </View>
  );
}

function EditorTabs({
  onToolChange,
  tool,
}: {
  readonly onToolChange: (tool: ComposerMediaEditorTool) => void;
  readonly tool: ComposerMediaEditorTool;
}) {
  return (
    <TabList
      accessibilityLabel="미디어 편집 도구"
      onValueChange={onToolChange}
      value={tool}
      variant="underline"
    >
      <Tab
        option={{
          accessibilityLabel: '이미지 편집 (준비 중)',
          disabled: true,
          label: '이미지 편집',
          value: 'image-edit',
        }}
      />
      <Tab option={{ label: '대체 텍스트', value: 'alt' }} />
      <Tab option={{ label: '민감도', value: 'sensitive' }} />
    </TabList>
  );
}

function MediaPreview({
  mediaCount,
  selected,
  selectedIndex,
}: {
  readonly mediaCount: number;
  readonly selected: ComposerMediaItem | undefined;
  readonly selectedIndex: number;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.previewSection, { backgroundColor: theme.backgroundSurface }]}>
      {selected ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={`선택한 첨부 이미지 ${selectedIndex + 1} 미리보기`}
          accessibilityRole="image"
          resizeMode="cover"
          source={{ uri: selected.asset.uri }}
          style={styles.selectedPreview}
        />
      ) : (
        <View style={[styles.selectedPreview, { backgroundColor: theme.backgroundElevated }]}>
          <Text style={[styles.emptyCopy, { color: theme.foregroundSecondary }]}>
            편집할 미디어가 없습니다.
          </Text>
        </View>
      )}
      <View style={styles.imageIndex}>
        <Text style={styles.imageIndexText}>
          {mediaCount === 0 ? '0 / 0' : `${selectedIndex + 1} / ${mediaCount}`}
        </Text>
      </View>
    </View>
  );
}

function MediaGallery({
  media,
  mobile = false,
  onSelectMedia,
  selectedKey,
}: {
  readonly media: readonly ComposerMediaItem[];
  readonly mobile?: boolean;
  readonly onSelectMedia: (key: string) => void;
  readonly selectedKey: string | undefined;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      accessibilityLabel="편집할 첨부 이미지 선택"
      contentContainerStyle={[styles.galleryContent, mobile && styles.mobileGalleryContent]}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[
        styles.mediaGallery,
        mobile && styles.mobileMediaGallery,
        { borderColor: theme.borderSubtle },
      ]}
    >
      {media.map((item, index) => {
        const selected = item.key === selectedKey;
        return (
          <Pressable
            accessibilityLabel={`첨부 이미지 ${index + 1} 선택`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={item.key}
            onPress={() => onSelectMedia(item.key)}
            style={({ pressed }) => [
              styles.thumbnailTarget,
              mobile && styles.mobileThumbnailTarget,
              {
                backgroundColor: selected ? theme.actionPrimaryBase : theme.borderSubtle,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: item.asset.uri }}
              style={[styles.thumbnail, mobile && styles.mobileThumbnail]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function WebToolPanel(
  props: ComposerMediaEditorProps & {
    readonly selected: ComposerMediaItem | undefined;
    readonly selectedIndex: number;
  },
) {
  const theme = useTheme();

  return (
    <View style={[styles.webToolPanel, { borderColor: theme.borderSubtle }]}>
      {props.tool === 'alt' ? (
        <AltToolContent
          altText={props.selected?.altText ?? ''}
          itemNumber={props.selectedIndex + 1}
          onAltTextChange={(value) => {
            if (props.selected) {
              props.onAltTextChange(props.selected.key, value);
            }
          }}
        />
      ) : (
        <SensitiveToolContent
          itemNumber={props.selectedIndex + 1}
          onSensitiveMediaChange={props.onSensitiveMediaChange}
          sensitiveMedia={props.sensitiveMedia}
        />
      )}
    </View>
  );
}

function MobileToolSheet(
  props: ComposerMediaEditorProps & {
    readonly selected: ComposerMediaItem | undefined;
    readonly selectedIndex: number;
  },
) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.mobileToolSheet,
        props.tool === 'alt' ? styles.mobileAltSheet : styles.mobileSensitiveSheet,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.borderSubtle },
      ]}
      testID="mobile-composer-media-editor-tool-sheet"
    >
      {props.tool === 'alt' ? (
        <AltToolContent
          altText={props.selected?.altText ?? ''}
          compact
          itemNumber={props.selectedIndex + 1}
          onAltTextChange={(value) => {
            if (props.selected) {
              props.onAltTextChange(props.selected.key, value);
            }
          }}
        />
      ) : (
        <SensitiveToolContent
          compact
          itemNumber={props.selectedIndex + 1}
          onSensitiveMediaChange={props.onSensitiveMediaChange}
          sensitiveMedia={props.sensitiveMedia}
        />
      )}
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
      testID="mobile-composer-media-editor-keyboard"
    >
      {[342, 326, 286, 168].map((width) => (
        <View
          key={width}
          style={[
            styles.keyboardRow,
            {
              backgroundColor: theme.backgroundElevated,
              borderColor: theme.borderSubtle,
              width,
            },
          ]}
        />
      ))}
    </View>
  );
}

function AltToolContent({
  altText,
  compact = false,
  itemNumber,
  onAltTextChange,
}: {
  readonly altText: string;
  readonly compact?: boolean;
  readonly itemNumber: number;
  readonly onAltTextChange: (value: string) => void;
}) {
  const theme = useTheme();

  return (
    <>
      {!compact ? (
        <Text style={[styles.eyebrow, { color: theme.foregroundSecondary }]}>
          이미지 {itemNumber}
        </Text>
      ) : null}
      <Text style={[styles.toolTitle, { color: theme.foregroundPrimary }]}>대체 텍스트</Text>
      {!compact ? (
        <Text style={[styles.toolDescription, { color: theme.foregroundSecondary }]}>
          이미지를 보지 못하는 사람도 게시물의 맥락을 이해할 수 있게 설명합니다.
        </Text>
      ) : null}
      <TextArea
        accessibilityLabel="이미지 설명"
        label={compact ? undefined : '이미지 설명'}
        maxLength={altTextLimit}
        onChangeText={onAltTextChange}
        placeholder="이미지에서 중요한 내용을 설명해 주세요."
        style={compact ? styles.mobileTextArea : undefined}
        value={altText}
      />
      {!compact ? (
        <>
          <Text style={[styles.helperCopy, { color: theme.foregroundSecondary }]}>
            안내문은 입력 영역 밖에 유지됩니다.
          </Text>
          <View style={styles.spacer} />
        </>
      ) : null}
      <Text style={[styles.counter, { color: theme.foregroundSecondary }]}>
        {altText.length} / {altTextLimit}
      </Text>
    </>
  );
}

function SensitiveToolContent({
  compact = false,
  itemNumber,
  onSensitiveMediaChange,
  sensitiveMedia,
}: {
  readonly compact?: boolean;
  readonly itemNumber: number;
  readonly onSensitiveMediaChange: (value: boolean) => void;
  readonly sensitiveMedia: boolean;
}) {
  const theme = useTheme();

  return (
    <>
      {!compact ? (
        <Text style={[styles.eyebrow, { color: theme.foregroundSecondary }]}>
          이미지 {itemNumber}에서 진입 · 전체 적용
        </Text>
      ) : null}
      <Text style={[styles.toolTitle, { color: theme.foregroundPrimary }]}>민감도</Text>
      <Text style={[styles.toolDescription, { color: theme.foregroundSecondary }]}>
        이 설정은 게시물에 첨부한 모든 이미지에 함께 적용됩니다.
      </Text>
      <View
        style={[
          styles.sensitiveSetting,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        <View style={styles.sensitiveCopy}>
          <Text style={[styles.sensitiveLabel, { color: theme.foregroundPrimary }]}>
            민감한 이미지
          </Text>
          <Text style={[styles.helperCopy, { color: theme.foregroundSecondary }]}>
            켜면 모든 첨부 이미지를 기본적으로 가립니다.
          </Text>
        </View>
        <Switch
          accessibilityLabel="민감한 이미지"
          onValueChange={onSensitiveMediaChange}
          value={sensitiveMedia}
        />
      </View>
      {!compact ? (
        <>
          <View style={styles.spacer} />
          <Text style={[styles.helperCopy, { color: theme.foregroundSecondary }]}>
            Post 단위 설정 · 모든 Flag가 함께 바뀝니다.
          </Text>
        </>
      ) : null}
    </>
  );
}

function MobileToolButton({
  icon,
  label,
  onPress,
  selected,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const theme = useTheme();

  return (
    <IconButton
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      feedback="opacity"
      onPress={onPress}
      targetSize={44}
      visualSize={44}
      visualStyle={{
        backgroundColor: selected ? theme.actionPrimaryBase : theme.backgroundElevated,
        borderColor: selected ? theme.actionPrimaryBase : theme.borderDefault,
        borderRadius: radius[12],
        borderWidth: borderWidths[1],
      }}
    >
      {icon}
    </IconButton>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', overflow: 'hidden' },
  header: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    height: 64,
    paddingHorizontal: space[12],
  },
  title: { flex: 1, textAlign: 'center', ...textStyles.uiHeadingS },
  mobileDone: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  mobileDoneLabel: textStyles.uiLabelM,
  pressed: { opacity: 0.7 },
  webBody: { flex: 1, flexDirection: 'row', minHeight: 0 },
  webWorkspace: { flex: 1, minWidth: 0 },
  previewSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
    padding: space[24],
    position: 'relative',
  },
  selectedPreview: { borderRadius: radius[12], height: '100%', maxHeight: 390, width: '100%' },
  emptyCopy: textStyles.uiCopyM,
  imageIndex: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: radius.full,
    height: 24,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: space[8],
    position: 'absolute',
    right: 34,
    top: 34,
  },
  imageIndexText: { color: '#ffffff', ...textStyles.uiLabelS },
  mediaGallery: {
    borderTopWidth: borderWidths[1],
    flexGrow: 0,
    height: 68,
    width: '100%',
  },
  galleryContent: {
    alignItems: 'center',
    flexGrow: 1,
    gap: space[8],
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  thumbnailTarget: {
    alignItems: 'center',
    borderRadius: radius[8],
    height: 48,
    justifyContent: 'center',
    padding: 2,
    width: 48,
  },
  thumbnail: { borderRadius: radius[4], height: 44, width: 44 },
  mobileMediaGallery: { height: 76 },
  mobileGalleryContent: { paddingVertical: 11 },
  mobileThumbnailTarget: { height: 54, width: 54 },
  mobileThumbnail: { height: 50, width: 50 },
  webToolPanel: {
    borderLeftWidth: borderWidths[1],
    gap: space[12],
    padding: 20,
    width: 280,
  },
  eyebrow: textStyles.uiCopyS,
  toolTitle: { textAlign: 'center', ...textStyles.uiHeadingS },
  toolDescription: textStyles.uiCopyM,
  helperCopy: textStyles.uiCopyS,
  spacer: { flex: 1 },
  counter: { textAlign: 'right', ...textStyles.uiCopyS },
  sensitiveSetting: {
    alignItems: 'center',
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    minHeight: 72,
    padding: space[12],
  },
  sensitiveCopy: { flex: 1, gap: space[4] },
  sensitiveLabel: textStyles.uiLabelM,
  footer: {
    alignItems: 'center',
    borderTopWidth: borderWidths[1],
    flexDirection: 'row',
    height: 64,
    paddingLeft: space[24],
    paddingRight: 18,
    paddingVertical: 10,
  },
  footerCopy: { flex: 1, ...textStyles.uiCopyM },
  mobileActions: {
    alignItems: 'center',
    borderTopWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    height: 66,
    justifyContent: 'center',
  },
  mobileAltSheet: { height: 176 },
  mobileSensitiveSheet: { height: 184 },
  mobileToolSheet: {
    borderTopLeftRadius: radius[16],
    borderTopRightRadius: radius[16],
    borderTopWidth: borderWidths[1],
    gap: space[8],
    padding: space[16],
  },
  mobileTextArea: { minHeight: 80 },
  keyboard: {
    alignItems: 'center',
    borderTopWidth: borderWidths[1],
    gap: space[12],
    height: 336,
    justifyContent: 'center',
  },
  keyboardRow: { borderRadius: radius[8], borderWidth: borderWidths[1], height: 44 },
});
