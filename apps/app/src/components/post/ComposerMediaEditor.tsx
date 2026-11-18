import {
  isValidMediaPublicationRights,
  MEDIA_USE_PERMISSION_LABELS,
  MediaUsePermission,
  mediaUseTermsUrl,
} from '@kosmo/core/media-metadata';
import { Link } from 'expo-router';
import {
  ArrowLeftIcon,
  CopyrightIcon,
  ExternalLinkIcon,
  FlagIcon,
  InfoIcon,
  XIcon,
} from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { Tab, TabList } from '@/components/ui/Tabs';
import { TextArea } from '@/components/ui/TextField';
import { getPublicWebOrigin } from '@/config/origin';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { MediaPublicationRights } from '@kosmo/core/media-metadata';
import type { Href } from 'expo-router';
import type { ReactNode, RefObject } from 'react';
import type { TextStyle } from 'react-native';
import type { ComposerMediaItem } from './PostComposerMediaControls';

export type ComposerMediaEditorTool = 'alt' | 'nightshade' | 'rights' | 'sensitive';
export type ComposerMediaEditorMobileState =
  | 'alt'
  | 'altKeyboard'
  | 'default'
  | 'nightshade'
  | 'rights'
  | 'sensitive';

export type ComposerMediaEditorProps = {
  readonly media: readonly ComposerMediaItem[];
  readonly mobileState?: ComposerMediaEditorMobileState;
  readonly onAltTextChange: (key: string, altText: string) => void;
  readonly onApplyAiProhibitFilterChange: (key: string, value: boolean) => void;
  readonly onRightsChange: (key: string, rights: MediaPublicationRights | undefined) => void;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly onPreviewPress?: () => void;
  readonly onSelectMedia: (key: string) => void;
  readonly onSensitiveMediaChange: (value: boolean) => void;
  readonly onToolChange: (tool: ComposerMediaEditorTool) => void;
  readonly presentation: 'mobile' | 'web';
  readonly selectedKey: string;
  readonly sensitiveMedia: boolean;
  readonly showImageEditPreview?: boolean;
  readonly tool: ComposerMediaEditorTool;
};

const altTextLimit = 1000;
const defaultMediaPublicationRights: MediaPublicationRights = {
  personal: MediaUsePermission.DENY,
  noncommercial: MediaUsePermission.DENY,
  commercial: MediaUsePermission.DENY,
};
const mediaPublicationRightOptions = [
  { label: MEDIA_USE_PERMISSION_LABELS[MediaUsePermission.DENY], value: MediaUsePermission.DENY },
  {
    label: MEDIA_USE_PERMISSION_LABELS[MediaUsePermission.ORIGINAL],
    value: MediaUsePermission.ORIGINAL,
  },
  { label: MEDIA_USE_PERMISSION_LABELS[MediaUsePermission.EDIT], value: MediaUsePermission.EDIT },
] as const;
const mediaPublicationRightPurposes = [
  { label: '개인적 이용', rowLabel: '개인', scope: 'personal' },
  { label: '비상업적 이용', rowLabel: '비상업', scope: 'noncommercial' },
  { label: '상업적 이용', rowLabel: '상업', scope: 'commercial' },
] as const satisfies readonly {
  label: string;
  rowLabel: string;
  scope: keyof MediaPublicationRights;
}[];
const composerFieldFocusStyle = {
  borderWidth: borderWidths[1],
  outlineWidth: 0,
} as unknown as TextStyle;

export function ComposerMediaEditor(props: ComposerMediaEditorProps) {
  const theme = useTheme();
  const nightshadeEnabled = useFeatureFlag('post-composer-nightshade');
  const backRef = useRef<View>(null);
  const selectedIndex = Math.max(
    0,
    props.media.findIndex(({ key }) => key === props.selectedKey),
  );
  const selected = props.media[selectedIndex];
  const mobile = props.presentation === 'mobile';
  const tool = !nightshadeEnabled && props.tool === 'nightshade' ? 'alt' : props.tool;
  const mobileState = props.mobileState ?? props.tool;
  const mobileTool =
    mobileState === 'default' || (!nightshadeEnabled && mobileState === 'nightshade')
      ? null
      : mobileState === 'alt' || mobileState === 'altKeyboard'
        ? 'alt'
        : mobileState;

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <View
      style={[
        styles.root,
        styles.fillContainer,
        { width: '100%' },
        { backgroundColor: theme.backgroundSurface },
      ]}
      testID={mobile ? 'mobile-composer-media-editor' : 'web-composer-media-editor'}
    >
      <EditorHeader
        backRef={backRef}
        mobile={mobile}
        onBack={props.onBack}
        onClose={props.onClose}
        onDone={props.onDone}
      />

      {mobile ? (
        <>
          <ScrollView
            contentContainerStyle={styles.mobileScrollContent}
            keyboardShouldPersistTaps="handled"
            style={styles.mobileScroll}
          >
            <MediaGallery
              media={props.media}
              mobile
              onSelectMedia={props.onSelectMedia}
              selectedKey={selected?.key}
            />
            <View style={styles.mobilePreview}>
              <MediaPreview
                mediaCount={props.media.length}
                onPreviewPress={props.onPreviewPress}
                selected={selected}
                selectedIndex={selectedIndex}
              />
            </View>
            <View
              accessibilityLabel="미디어 편집 도구"
              style={[styles.mobileActions, { borderColor: theme.borderSubtle }]}
            >
              <MobileToolButton
                icon={
                  <Text style={[styles.altToolLabel, { color: theme.foregroundPrimary }]}>ALT</Text>
                }
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
              {nightshadeEnabled ? (
                <MobileToolButton
                  icon={
                    <Text style={[styles.altToolLabel, { color: theme.foregroundPrimary }]}>
                      AI
                    </Text>
                  }
                  label="AI 학습 방지 필터(베타)"
                  onPress={() => props.onToolChange('nightshade')}
                  selected={mobileTool === 'nightshade'}
                />
              ) : null}
              <MobileToolButton
                icon={<CopyrightIcon color={theme.foregroundPrimary} size={iconSizes[20]} />}
                label="이용조건"
                onPress={() => props.onToolChange('rights')}
                selected={mobileTool === 'rights'}
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
          </ScrollView>
          {mobileState === 'altKeyboard' ? <IllustrativeKeyboard /> : null}
        </>
      ) : (
        <>
          <EditorTabs
            nightshadeEnabled={nightshadeEnabled}
            onToolChange={props.onToolChange}
            showImageEditPreview={props.showImageEditPreview ?? false}
            tool={tool}
          />
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
            <WebToolPanel
              {...props}
              selected={selected}
              selectedIndex={selectedIndex}
              tool={tool}
            />
          </View>
          <View
            style={[styles.footer, { borderColor: theme.borderSubtle }]}
            testID="composer-media-editor-footer"
          >
            <Button onPress={props.onDone}>완료</Button>
          </View>
        </>
      )}
    </View>
  );
}

function EditorHeader({
  backRef,
  mobile,
  onBack,
  onClose,
  onDone,
}: {
  readonly backRef: RefObject<View | null>;
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
        controlRef={backRef}
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
          hitSlop={Platform.OS === 'android' ? 2 : undefined}
          onPress={onDone}
          style={({ pressed }) => [styles.mobileDone, pressed && styles.pressed]}
        >
          <Text style={[styles.mobileDoneLabel, { color: theme.foregroundPrimary }]}>완료</Text>
        </Pressable>
      ) : (
        <IconButton
          accessibilityLabel="미디어 편집 닫기"
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
  nightshadeEnabled,
  onToolChange,
  showImageEditPreview,
  tool,
}: {
  readonly nightshadeEnabled: boolean;
  readonly onToolChange: (tool: ComposerMediaEditorTool) => void;
  readonly showImageEditPreview: boolean;
  readonly tool: ComposerMediaEditorTool;
}) {
  const tabs = [
    ...(showImageEditPreview
      ? [
          <Tab
            key="image-edit"
            option={{
              accessibilityLabel: '이미지 편집 (준비 중)',
              disabled: true,
              label: '이미지 편집',
              value: 'image-edit',
            }}
          />,
        ]
      : []),
    <Tab key="alt" option={{ label: '대체 텍스트', value: 'alt' }} />,
    <Tab key="sensitive" option={{ label: '민감도', value: 'sensitive' }} />,
    ...(nightshadeEnabled
      ? [
          <Tab
            key="nightshade"
            option={{ label: 'AI 학습 방지 필터(베타)', value: 'nightshade' }}
          />,
        ]
      : []),
    <Tab key="rights" option={{ label: '이용조건', value: 'rights' }} />,
  ];

  return (
    <TabList
      accessibilityLabel="미디어 편집 도구"
      onValueChange={onToolChange}
      value={tool}
      variant="underline"
    >
      {tabs}
    </TabList>
  );
}

function MediaPreview({
  mediaCount,
  onPreviewPress,
  selected,
  selectedIndex,
}: {
  readonly mediaCount: number;
  readonly onPreviewPress?: () => void;
  readonly selected: ComposerMediaItem | undefined;
  readonly selectedIndex: number;
}) {
  const theme = useTheme();
  const selectedPreview = selected ? (
    <Image
      accessibilityElementsHidden={Boolean(onPreviewPress)}
      accessibilityIgnoresInvertColors
      accessibilityLabel={`선택한 첨부 이미지 ${selectedIndex + 1} 미리보기`}
      accessibilityRole="image"
      fadeDuration={0}
      resizeMode="contain"
      source={{ uri: selected.asset.uri }}
      style={styles.selectedPreview}
    />
  ) : (
    <View style={[styles.selectedPreview, { backgroundColor: theme.backgroundElevated }]}>
      <Text style={[styles.emptyCopy, { color: theme.foregroundSecondary }]}>
        편집할 미디어가 없습니다.
      </Text>
    </View>
  );

  return (
    <View style={[styles.previewSection, { backgroundColor: theme.backgroundSurface }]}>
      {selected && onPreviewPress ? (
        <Pressable
          accessibilityLabel={`선택한 첨부 이미지 ${selectedIndex + 1} 미리보기`}
          accessibilityRole="button"
          onPress={onPreviewPress}
          style={({ pressed }) => [styles.selectedPreview, pressed && styles.pressed]}
        >
          {selectedPreview}
        </Pressable>
      ) : (
        selectedPreview
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
      testID="composer-media-editor-gallery"
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
              fadeDuration={0}
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
    <ScrollView
      contentContainerStyle={styles.webToolPanelContent}
      keyboardShouldPersistTaps="handled"
      style={[styles.webToolPanel, { borderColor: theme.borderSubtle }]}
      testID="composer-media-editor-tool-panel"
    >
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
      ) : props.tool === 'sensitive' ? (
        <SensitiveToolContent
          itemNumber={props.selectedIndex + 1}
          onSensitiveMediaChange={props.onSensitiveMediaChange}
          sensitiveMedia={props.sensitiveMedia}
        />
      ) : props.tool === 'rights' ? (
        <RightsToolContent
          itemNumber={props.selectedIndex + 1}
          onRightsChange={(rights) => {
            if (props.selected) {
              props.onRightsChange(props.selected.key, rights);
            }
          }}
          rights={props.selected?.rights}
        />
      ) : (
        <NightshadeToolContent
          applyAiProhibitFilter={props.selected?.applyAiProhibitFilter ?? false}
          itemNumber={props.selectedIndex + 1}
          onApplyAiProhibitFilterChange={(value) => {
            if (props.selected) {
              props.onApplyAiProhibitFilterChange(props.selected.key, value);
            }
          }}
        />
      )}
    </ScrollView>
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
      ) : props.tool === 'sensitive' ? (
        <SensitiveToolContent
          compact
          itemNumber={props.selectedIndex + 1}
          onSensitiveMediaChange={props.onSensitiveMediaChange}
          sensitiveMedia={props.sensitiveMedia}
        />
      ) : props.tool === 'rights' ? (
        <RightsToolContent
          compact
          itemNumber={props.selectedIndex + 1}
          onRightsChange={(rights) => {
            if (props.selected) {
              props.onRightsChange(props.selected.key, rights);
            }
          }}
          rights={props.selected?.rights}
        />
      ) : (
        <NightshadeToolContent
          applyAiProhibitFilter={props.selected?.applyAiProhibitFilter ?? false}
          compact
          itemNumber={props.selectedIndex + 1}
          onApplyAiProhibitFilterChange={(value) => {
            if (props.selected) {
              props.onApplyAiProhibitFilterChange(props.selected.key, value);
            }
          }}
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
        onChangeText={(value) => onAltTextChange([...value].slice(0, altTextLimit).join(''))}
        placeholder="이미지에서 중요한 내용을 설명해 주세요."
        style={[composerFieldFocusStyle, compact ? styles.mobileTextArea : undefined]}
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
        {[...altText].length} / {altTextLimit}
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

function NightshadeToolContent({
  applyAiProhibitFilter,
  compact = false,
  itemNumber,
  onApplyAiProhibitFilterChange,
}: {
  readonly applyAiProhibitFilter: boolean;
  readonly compact?: boolean;
  readonly itemNumber: number;
  readonly onApplyAiProhibitFilterChange: (value: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <>
      {!compact ? (
        <Text style={[styles.eyebrow, { color: theme.foregroundSecondary }]}>
          이미지 {itemNumber}
        </Text>
      ) : null}
      <Text style={[styles.toolTitle, { color: theme.foregroundPrimary }]}>
        AI 학습 방지 필터(베타)
      </Text>
      <View
        style={[
          styles.sensitiveSetting,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        <View style={styles.sensitiveCopy}>
          <Text style={[styles.sensitiveLabel, { color: theme.foregroundPrimary }]}>
            AI 학습 방지 필터 적용
          </Text>
          <Text style={[styles.helperCopy, { color: theme.foregroundSecondary }]}>
            실험적인 기능이며 예고 없이 변경될 수 있습니다.
            {'\n'}
            이미지 처리는 10~30분이 소요되며 작업 대기열 상황에 따라 더 오래 지연될 수 있습니다.
          </Text>
        </View>
        <Switch
          accessibilityLabel={`첨부 이미지 ${itemNumber} AI 학습 방지 필터 적용`}
          onValueChange={onApplyAiProhibitFilterChange}
          value={applyAiProhibitFilter}
        />
      </View>
    </>
  );
}

function RightsToolContent({
  compact = false,
  itemNumber,
  onRightsChange,
  rights,
}: {
  readonly compact?: boolean;
  readonly itemNumber: number;
  readonly onRightsChange: (rights: MediaPublicationRights | undefined) => void;
  readonly rights: MediaPublicationRights | undefined;
}) {
  const theme = useTheme();

  return (
    <>
      {!compact ? (
        <Text style={[styles.eyebrow, { color: theme.foregroundSecondary }]}>
          이미지 {itemNumber}
        </Text>
      ) : null}
      <Text style={[styles.toolTitle, { color: theme.foregroundPrimary }]}>이용조건</Text>
      <View
        style={[
          styles.sensitiveSetting,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        <View style={styles.sensitiveCopy}>
          <Text style={[styles.sensitiveLabel, { color: theme.foregroundPrimary }]}>
            라이센스 설정
          </Text>
        </View>
        <Switch
          accessibilityLabel="라이센스 설정"
          onValueChange={(enabled) =>
            onRightsChange(enabled ? { ...defaultMediaPublicationRights } : undefined)
          }
          value={rights !== undefined}
        />
      </View>
      <View style={styles.rightsNotice}>
        <View accessibilityElementsHidden pointerEvents="none">
          <InfoIcon color={theme.foregroundSecondary} size={iconSizes[16]} />
        </View>
        <Text style={[styles.rightsNoticeText, { color: theme.foregroundSecondary }]}>
          저작권을 보유한 이미지에만 설정하세요.
        </Text>
      </View>
      {rights ? (
        <>
          <View style={styles.rightsMatrix}>
            <View style={styles.rightsMatrixHeader}>
              <View style={styles.rightsRowLabelColumn} />
              <View style={styles.rightsMatrixOptions}>
                {mediaPublicationRightOptions.map((option) => (
                  <Text
                    key={option.value}
                    style={[styles.rightsColumnHeader, { color: theme.foregroundSecondary }]}
                  >
                    {option.label}
                  </Text>
                ))}
              </View>
            </View>
            {mediaPublicationRightPurposes.map(({ label, rowLabel, scope }) => (
              <View key={scope} style={styles.rightsMatrixRow}>
                <Text
                  style={[
                    styles.rightsRowLabelColumn,
                    styles.rightsRowLabel,
                    { color: theme.foregroundPrimary },
                  ]}
                >
                  {rowLabel}
                </Text>
                <RadioGroup
                  accessibilityLabel={label}
                  onChange={(value) => {
                    const nextRights = { ...rights, [scope]: value };
                    if (isValidMediaPublicationRights(nextRights)) {
                      onRightsChange(nextRights);
                    }
                  }}
                  style={styles.rightsMatrixOptions}
                  value={rights[scope]}
                >
                  {mediaPublicationRightOptions.map((option) => {
                    const nextRights = { ...rights, [scope]: option.value };
                    // The column headers provide visible labels; each radio keeps its canonical accessible label.
                    return (
                      <RadioOption
                        key={option.value}
                        children={false}
                        option={{
                          ...option,
                          disabled: !isValidMediaPublicationRights(nextRights),
                        }}
                        style={styles.rightsMatrixOption}
                      />
                    );
                  })}
                </RadioGroup>
              </View>
            ))}
          </View>
          <Link
            asChild
            href={mediaUseTermsUrl(rights, getPublicWebOrigin()) as Href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Pressable
              accessibilityLabel="이용조건 보기"
              accessibilityRole="link"
              style={styles.rightsTermsLink}
            >
              <Text style={[styles.rightsTermsLinkText, { color: theme.actionLinkBase }]}>
                이용조건 보기
              </Text>
              <View accessibilityElementsHidden pointerEvents="none">
                <ExternalLinkIcon color={theme.actionLinkBase} size={iconSizes[16]} />
              </View>
            </Pressable>
          </Link>
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
  fillContainer: { flex: 1, height: '100%', minHeight: 0 },
  mobileScroll: { flex: 1, minHeight: 0 },
  mobileScrollContent: { flexGrow: 1 },
  mobilePreview: { flex: 1, minHeight: 120 },
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
  mobileMediaGallery: { borderTopWidth: borderWidths[1], height: 76 },
  mobileGalleryContent: { paddingVertical: 11 },
  mobileThumbnailTarget: { height: 54, width: 54 },
  mobileThumbnail: { height: 50, width: 50 },
  webToolPanel: {
    borderLeftWidth: borderWidths[1],
    flexGrow: 0,
    width: 280,
  },
  webToolPanelContent: {
    flexGrow: 1,
    gap: space[12],
    padding: 20,
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
  rightsNotice: { alignItems: 'center', flexDirection: 'row', gap: space[4] },
  rightsNoticeText: { flex: 1, ...textStyles.uiCopyS },
  rightsMatrix: { gap: space[4] },
  rightsMatrixHeader: { alignItems: 'center', flexDirection: 'row' },
  rightsColumnHeader: { flex: 1, textAlign: 'center', ...textStyles.uiCopyS },
  rightsMatrixRow: { alignItems: 'center', flexDirection: 'row' },
  rightsRowLabelColumn: { width: space[48] },
  rightsRowLabel: textStyles.uiLabelS,
  rightsMatrixOptions: { flex: 1, flexDirection: 'row' },
  rightsMatrixOption: {
    flex: 1,
    justifyContent: 'center',
    minHeight: space[48],
    minWidth: space[48],
    padding: 0,
  },
  rightsTermsLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: space[4],
    minHeight: 48,
  },
  rightsTermsLinkText: { ...textStyles.uiLabelS, textDecorationLine: 'underline' },
  altToolLabel: textStyles.uiLabelS,
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 64,
    justifyContent: 'flex-end',
    paddingRight: 18,
    paddingVertical: 10,
  },
  mobileActions: {
    alignItems: 'center',
    borderTopWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    height: 66,
    justifyContent: 'center',
  },
  mobileAltSheet: { minHeight: 176 },
  mobileSensitiveSheet: { minHeight: 184 },
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
