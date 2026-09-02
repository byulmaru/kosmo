import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { XIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ComposerMediaEditor } from '@/components/post/ComposerMediaEditor';
import {
  MobileFullscreenComposerShellCandidate,
  PostComposerTarget,
} from '@/components/post/PostComposerTarget';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, space, textStyles } from '@/theme/tokens';
import ogImage from '../../../public/og-default.png?url';
import { ComposerOverlayFixture } from '../fixtures/ComposerOverlayFixture';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerMediaEditorMobileState } from '@/components/post/ComposerMediaEditor';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';
import type { PostComposerTargetProps } from '@/components/post/PostComposerTarget';

const mediaAsset = { height: 390, uri: ogImage, width: 560 };

export const composerMedia: readonly ComposerMediaItem[] = [
  { altText: '', asset: mediaAsset, key: 'uploading', state: 'uploading' },
  {
    altText: '노을빛 밤하늘 아래 모인 사람들',
    asset: mediaAsset,
    key: 'ready',
    mediaId: 'media-ready',
    state: 'ready',
  },
  {
    altText: '',
    asset: mediaAsset,
    failure: { reason: 'transient', stage: 'transfer' },
    key: 'failed',
    state: 'failed',
  },
];

const readyComposerMedia = composerMedia.filter((item) => item.state === 'ready');
const onMobileClose = fn();

const reactionOptions = [
  {
    category: 'expressions',
    categoryLabel: '표정과 감정',
    emoji: '🥹',
    id: 'moved',
    keywords: ['감동'],
    label: '감동',
    quick: true,
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '❤️',
    id: 'heart-red',
    keywords: ['하트', '사랑'],
    label: '빨간 하트',
    quick: true,
    recent: true,
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '👏',
    id: 'clap',
    keywords: ['박수'],
    label: '박수',
    recent: true,
  },
] as const;

function Author() {
  const theme = useTheme();
  return (
    <View style={styles.author}>
      <Avatar label="코스모 작가" />
      <View style={styles.authorCopy}>
        <Text style={[styles.authorName, { color: theme.foregroundPrimary }]}>코스모 작가</Text>
        <Text style={[styles.authorHandle, { color: theme.foregroundSecondary }]}>@kosmo</Text>
      </View>
    </View>
  );
}

const meta = {
  args: {
    author: <Author />,
    body: '오늘의 코스모 이야기를 나눠보세요.',
    contentWarning: '',
    contentWarningExpanded: false,
    error: undefined,
    items: composerMedia,
    onBodyChange: fn(),
    onContentWarningChange: fn(),
    onContentWarningToggle: fn(),
    onEmojiAction: fn(),
    onExpand: fn(),
    onMediaAction: fn(),
    onMediaEdit: fn(),
    onMediaRemove: fn(),
    onMediaRetry: fn(),
    onPollAction: fn(),
    onSubmit: fn(),
    onVisibilityChange: fn(),
    remaining: 450,
    sensitiveMedia: false,
    showCWAction: true,
    showEmojiAction: true,
    showMediaAction: true,
    showPollAction: false,
    showSubmit: true,
    submitting: false,
    surface: 'rail',
    visibility: 'UNLISTED',
  },
  argTypes: {
    author: { control: false },
    body: { control: 'text' },
    contentWarning: { control: 'text' },
    contentWarningExpanded: { control: 'boolean' },
    error: { control: 'text' },
    items: { control: false },
    onBodyChange: { action: 'bodyChange', control: false },
    onContentWarningChange: { action: 'contentWarningChange', control: false },
    onContentWarningToggle: { action: 'contentWarningToggle', control: false },
    onEmojiAction: { action: 'emojiAction', control: false },
    onExpand: { action: 'expand', control: false },
    onMediaAction: { action: 'mediaAction', control: false },
    onMediaEdit: { action: 'mediaEdit', control: false },
    onMediaRemove: { action: 'mediaRemove', control: false },
    onMediaRetry: { action: 'mediaRetry', control: false },
    onPollAction: { action: 'pollAction', control: false },
    onSubmit: { action: 'submit', control: false },
    onVisibilityChange: { action: 'visibilityChange', control: false },
    remaining: { control: false },
    sensitiveMedia: { control: 'boolean' },
    showCWAction: { control: 'boolean' },
    showEmojiAction: { control: 'boolean' },
    showMediaAction: { control: 'boolean' },
    showPollAction: { control: false },
    showSubmit: { control: 'boolean' },
    submitting: { control: 'boolean' },
    surface: { control: 'inline-radio', options: ['rail', 'overlay'] },
    visibility: { control: 'select', options: ['PUBLIC', 'UNLISTED', 'FOLLOWERS'] },
  },
  component: PostComposerTarget,
  excludeStories: [
    'InteractionContract',
    'MobileCandidateContract',
    'MobileKeyboardMediaFooterGeometryContract',
    'MobileKeyboardContract',
    'MobileKeyboardCWEditorGeometryContract',
    'MobileKeyboardMediaEditorGeometryContract',
    'MobileMediaFooterGeometryContract',
    'MobilePlaygroundContract',
    'MobileFlexLayoutContract',
    'OverlayProgressRingContract',
    'PendingMediaContract',
    'ProgressRingToneContract',
    'RailProgressRingContract',
    'SubmittingSpinnerContract',
    'composerMedia',
  ],
  parameters: { controls: { disable: true }, layout: 'centered' },
  title: 'KOSMO/Patterns/Post Composer Target',
} satisfies Meta<typeof PostComposerTarget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'body',
        'contentWarning',
        'contentWarningExpanded',
        'sensitiveMedia',
        'showCWAction',
        'showEmojiAction',
        'showMediaAction',
        'showSubmit',
        'submitting',
        'surface',
        'visibility',
      ],
    },
  },
  render: (args) => <InteractiveComposer {...args} showPollAction={false} />,
};

export const RailEmptyPublic: Story = {
  args: { body: '', items: [], remaining: 500, surface: 'rail', visibility: 'PUBLIC' },
};

export const RailFilledUnlistedCW: Story = {
  args: { contentWarning: '스포일러가 포함되어 있어요.', contentWarningExpanded: true, items: [] },
};

export const OverlayMediaFollowers: Story = {
  args: { surface: 'overlay', visibility: 'FOLLOWERS' },
  render: (args) => (
    <View style={{ width: 600 }}>
      <InteractiveComposer {...args} />
    </View>
  ),
};

export const Submitting: Story = { args: { items: [], submitting: true } };
export const Error: Story = {
  args: { body: '미디어 업로드 실패를 확인할 본문', error: undefined, items: [composerMedia[2]] },
};

export const SubmitFailure: Story = {
  args: { body: '제출 실패를 확인할 본문', error: undefined, items: [], surface: 'rail' },
  render: (args) => <SubmitFailureComposer {...args} />,
};

export const RailMedia: Story = {
  args: { body: '세 장 미디어 접근성 확인', items: composerMedia, surface: 'rail' },
  render: (args) => (
    <View style={styles.railMediaFixture} testID="post-composer-rail-media-reachability">
      <InteractiveComposer {...args} />
    </View>
  ),
};

export const CompactOverlay: Story = {
  args: { surface: 'overlay' },
  render: (args) => (
    <View style={{ width: 480 }}>
      <InteractiveComposer {...args} />
    </View>
  ),
};

const mobileGlobals = { viewport: { isRotated: false, value: 'kosmoMobile' } } as const;
const mobileParameters = { layout: 'fullscreen' } as const;
const submitFailureMessage = '게시글을 작성하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export const MobilePlayground: Story = {
  args: { items: readyComposerMedia, surface: 'overlay' },
  globals: mobileGlobals,
  parameters: mobileParameters,
  render: (args) => <InteractiveComposer {...args} mobile />,
};

export const MobileEmpty: Story = {
  args: { body: '', items: [], remaining: 500, surface: 'overlay' },
  globals: mobileGlobals,
  parameters: mobileParameters,
  render: (args) => <InteractiveComposer {...args} mobile />,
};

export const MobileMedia: Story = {
  ...MobilePlayground,
};

export const MobileCW: Story = {
  args: {
    contentWarning: '스포일러가 포함되어 있어요.',
    contentWarningExpanded: true,
    items: [],
    surface: 'overlay',
  },
  globals: mobileGlobals,
  parameters: mobileParameters,
  render: (args) => <InteractiveComposer {...args} mobile />,
};

export const MobileKeyboardEmpty: Story = {
  ...MobileEmpty,
  render: (args) => <InteractiveComposer {...args} keyboard mobile />,
};

export const MobileKeyboardMedia: Story = {
  ...MobileMedia,
  render: (args) => <InteractiveComposer {...args} keyboard mobile />,
};

export const MobileKeyboardCW: Story = {
  ...MobileCW,
  render: (args) => <InteractiveComposer {...args} keyboard mobile />,
};

function SubmitFailureComposer(props: PostComposerTargetProps) {
  const { showToast } = useToast();

  return (
    <InteractiveComposer
      {...props}
      onSubmit={() => {
        props.onSubmit();
        showToast(submitFailureMessage, { tone: 'danger' });
      }}
    />
  );
}

function InteractiveComposer({
  keyboard = false,
  mobile = false,
  ...props
}: PostComposerTargetProps & { keyboard?: boolean; mobile?: boolean }) {
  const theme = useTheme();
  const composerProps = { ...props, showPollAction: false };
  const [body, setBody] = useState(props.body);
  const [contentWarning, setContentWarning] = useState(props.contentWarning);
  const [contentWarningExpanded, setContentWarningExpanded] = useState(
    props.contentWarningExpanded,
  );
  const [items, setItems] = useState(props.items);
  const [visibility, setVisibility] = useState(props.visibility);
  const [sensitiveMedia, setSensitiveMedia] = useState(props.sensitiveMedia);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [editor, setEditor] = useState<{
    key: string;
    mobileState: ComposerMediaEditorMobileState;
    tool: 'alt' | 'sensitive';
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('expressions');
  const [pickerPosition, setPickerPosition] = useState({
    left: space[8] as number,
    top: space[8] as number,
  });
  const remaining =
    postBodyMaxLength -
    normalizePostContentPlainText(body).length -
    normalizePostContentPlainText(contentWarning).length;

  useEffect(() => setBody(props.body), [props.body]);
  useEffect(() => setContentWarning(props.contentWarning), [props.contentWarning]);
  useEffect(
    () => setContentWarningExpanded(props.contentWarningExpanded),
    [props.contentWarningExpanded],
  );
  useEffect(() => setItems(props.items), [props.items]);
  useEffect(() => setVisibility(props.visibility), [props.visibility]);
  useEffect(() => setSensitiveMedia(props.sensitiveMedia), [props.sensitiveMedia]);
  useEffect(() => {
    if (mobile || !pickerOpen || typeof document === 'undefined') {
      return;
    }

    const triggers = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-label="이모지 추가"]'),
    ).filter((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
    const trigger = triggers[triggers.length - 1];
    const storyWindow = trigger?.ownerDocument.defaultView;
    if (!trigger || !storyWindow) {
      return;
    }

    const bounds = trigger.getBoundingClientRect();
    const panelWidth = 360;
    const panelHeight = 624;
    const gap = space[8];
    const maxLeft = Math.max(gap, storyWindow.innerWidth - panelWidth - gap);
    setPickerPosition({
      left: Math.min(Math.max(gap, bounds.right - panelWidth), maxLeft),
      top:
        storyWindow.innerHeight - bounds.bottom >= panelHeight + gap
          ? bounds.bottom + gap
          : Math.max(gap, bounds.top - panelHeight - gap),
    });
  }, [mobile, pickerOpen]);

  const closeOverlay = () => {
    setEditor(null);
    setOverlayOpen(false);
    setPickerOpen(false);
  };

  const picker = pickerOpen ? (
    <View pointerEvents="box-none" style={mobile ? styles.mobilePicker : styles.pickerLayer}>
      {!mobile ? (
        <Pressable
          accessibilityLabel="반응 선택 닫기"
          accessibilityRole="button"
          onPress={() => setPickerOpen(false)}
          style={styles.pickerDismiss}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.pickerPanel,
          mobile
            ? styles.mobilePickerPanel
            : { left: pickerPosition.left, top: pickerPosition.top },
        ]}
        testID="post-composer-emoji-picker"
      >
        <FullReactionPicker
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onQueryChange={setPickerQuery}
          onSelect={(option) => {
            const value = `${body}${option.emoji}`;
            props.onBodyChange(value);
            setBody(value);
            setPickerOpen(false);
          }}
          options={reactionOptions}
          presentation={mobile ? 'mobile' : 'web'}
          query={pickerQuery}
          selectedValues={[]}
        />
      </View>
    </View>
  ) : null;

  if (mobile && editor) {
    return (
      <ComposerMediaEditor
        media={items.filter((item) => item.state === 'ready')}
        mobileState={editor.mobileState}
        onAltTextChange={(key, altText) => {
          setItems((current) =>
            current.map((item) => (item.key === key ? { ...item, altText } : item)),
          );
        }}
        onBack={() => setEditor(null)}
        onClose={() => setEditor(null)}
        onDone={() => setEditor(null)}
        onPreviewPress={
          editor.mobileState === 'altKeyboard'
            ? () =>
                setEditor((current) => (current ? { ...current, mobileState: 'default' } : current))
            : undefined
        }
        onSelectMedia={(key) => setEditor((current) => (current ? { ...current, key } : current))}
        onSensitiveMediaChange={setSensitiveMedia}
        onToolChange={(tool) =>
          setEditor((current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              mobileState:
                tool === 'sensitive'
                  ? 'sensitive'
                  : current.mobileState === 'altKeyboard'
                    ? 'default'
                    : 'altKeyboard',
              tool,
            };
          })
        }
        presentation={mobile ? 'mobile' : 'web'}
        selectedKey={editor.key}
        sensitiveMedia={sensitiveMedia}
        showImageEditPreview={false}
        tool={editor.tool}
      />
    );
  }

  return (
    <View style={styles.composition}>
      {mobile ? (
        <MobileFullscreenComposerShellCandidate
          {...composerProps}
          body={body}
          contentWarning={contentWarning}
          contentWarningExpanded={contentWarningExpanded}
          items={items}
          remaining={remaining}
          keyboard={keyboard}
          onBodyChange={(value) => {
            props.onBodyChange(value);
            setBody(value);
          }}
          onContentWarningChange={(value) => {
            props.onContentWarningChange(value);
            setContentWarning(value);
          }}
          onContentWarningToggle={() => {
            props.onContentWarningToggle();
            setContentWarningExpanded((expanded) => !expanded);
          }}
          onEmojiAction={() => {
            props.onEmojiAction();
            setPickerOpen(true);
          }}
          onMediaEdit={(key, tool) => {
            props.onMediaEdit(key, tool);
            setEditor({
              key,
              mobileState: tool === 'alt' ? 'altKeyboard' : 'sensitive',
              tool,
            });
          }}
          onMediaRemove={(key) => {
            props.onMediaRemove(key);
            setItems((current) => current.filter((item) => item.key !== key));
          }}
          onMediaRetry={(key) => props.onMediaRetry(key)}
          onOverlayClose={onMobileClose}
          onVisibilityChange={(value) => {
            props.onVisibilityChange(value);
            setVisibility(value);
          }}
          sensitiveMedia={sensitiveMedia}
          visibility={visibility}
        />
      ) : (
        <PostComposerTarget
          {...composerProps}
          body={body}
          contentWarning={contentWarning}
          contentWarningExpanded={contentWarningExpanded}
          items={items}
          remaining={remaining}
          onBodyChange={(value) => {
            props.onBodyChange(value);
            setBody(value);
          }}
          onContentWarningChange={(value) => {
            props.onContentWarningChange(value);
            setContentWarning(value);
          }}
          onContentWarningToggle={() => {
            props.onContentWarningToggle();
            setContentWarningExpanded((expanded) => !expanded);
          }}
          onEmojiAction={() => {
            props.onEmojiAction();
            setPickerOpen(true);
          }}
          onExpand={() => {
            props.onExpand();
            setOverlayOpen(true);
          }}
          onMediaEdit={(key, tool) => {
            props.onMediaEdit(key, tool);
            setEditor({
              key,
              mobileState: tool === 'alt' ? 'altKeyboard' : 'sensitive',
              tool,
            });
            setOverlayOpen(true);
          }}
          onMediaRemove={(key) => {
            props.onMediaRemove(key);
            setItems((current) => current.filter((item) => item.key !== key));
          }}
          onMediaRetry={(key) => props.onMediaRetry(key)}
          onVisibilityChange={(value) => {
            props.onVisibilityChange(value);
            setVisibility(value);
          }}
          sensitiveMedia={sensitiveMedia}
          surface={props.surface}
          visibility={visibility}
        />
      )}
      {!mobile && overlayOpen ? (
        <ComposerOverlayFixture
          accessibilityLabel="글쓰기"
          maxWidth={editor ? 920 : 600}
          onRequestClose={closeOverlay}
          visible
        >
          {editor ? (
            <ComposerMediaEditor
              media={items.filter((item) => item.state === 'ready')}
              onAltTextChange={(key, altText) => {
                setItems((current) =>
                  current.map((item) => (item.key === key ? { ...item, altText } : item)),
                );
              }}
              onBack={() => setEditor(null)}
              onClose={closeOverlay}
              onDone={() => setEditor(null)}
              onSelectMedia={(key) =>
                setEditor((current) => (current ? { ...current, key } : current))
              }
              onSensitiveMediaChange={setSensitiveMedia}
              onToolChange={(tool) =>
                setEditor((current) => (current ? { ...current, tool } : current))
              }
              presentation="web"
              selectedKey={editor.key}
              sensitiveMedia={sensitiveMedia}
              showImageEditPreview={false}
              tool={editor.tool}
            />
          ) : (
            <View style={styles.overlayContent}>
              <View style={[styles.overlayHeader, { borderColor: theme.borderSubtle }]}>
                <Text
                  accessibilityRole="header"
                  style={[styles.overlayTitle, { color: theme.foregroundPrimary }]}
                >
                  글쓰기
                </Text>
                <IconButton
                  accessibilityLabel="글쓰기 닫기"
                  onPress={closeOverlay}
                  style={styles.overlayClose}
                  targetSize={40}
                >
                  <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} strokeWidth={2} />
                </IconButton>
              </View>
              <PostComposerTarget
                {...composerProps}
                body={body}
                contentWarning={contentWarning}
                contentWarningExpanded={contentWarningExpanded}
                items={items}
                remaining={remaining}
                onBodyChange={(value) => {
                  props.onBodyChange(value);
                  setBody(value);
                }}
                onContentWarningChange={(value) => {
                  props.onContentWarningChange(value);
                  setContentWarning(value);
                }}
                onContentWarningToggle={() => {
                  props.onContentWarningToggle();
                  setContentWarningExpanded((expanded) => !expanded);
                }}
                onEmojiAction={() => {
                  props.onEmojiAction();
                  setPickerOpen(true);
                }}
                onMediaEdit={(key, tool) => {
                  props.onMediaEdit(key, tool);
                  setEditor({
                    key,
                    mobileState: tool === 'alt' ? 'altKeyboard' : 'sensitive',
                    tool,
                  });
                }}
                onMediaRemove={(key) => {
                  props.onMediaRemove(key);
                  setItems((current) => current.filter((item) => item.key !== key));
                }}
                onMediaRetry={(key) => props.onMediaRetry(key)}
                onVisibilityChange={(value) => {
                  props.onVisibilityChange(value);
                  setVisibility(value);
                }}
                sensitiveMedia={sensitiveMedia}
                surface="overlay"
                visibility={visibility}
              />
              {picker}
            </View>
          )}
        </ComposerOverlayFixture>
      ) : (
        picker
      )}
    </View>
  );
}

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onBodyChange.mockClear();
    args.onContentWarningChange.mockClear();
    args.onContentWarningToggle.mockClear();
    args.onEmojiAction.mockClear();
    args.onExpand.mockClear();
    args.onMediaEdit.mockClear();
    args.onMediaRemove.mockClear();
    args.onMediaRetry.mockClear();
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const railBody = canvas.getByRole('textbox', { name: '게시물 내용' });

    await userEvent.click(canvas.getByRole('button', { name: 'Composer 확장' }));
    expect(args.onExpand).toHaveBeenCalledOnce();
    expect(railBody).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: 'Composer 확장' })).toBeInTheDocument();

    const dialog = page.getByRole('dialog', { name: '글쓰기' });
    expect(dialog).toBeVisible();
    expect(page.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getByRole('heading', { name: '글쓰기' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '글쓰기 닫기' })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Composer 확장' })).toBeNull();
    const body = within(dialog).getByRole('textbox', { name: '게시물 내용' });
    expect(body).toHaveValue('오늘의 코스모 이야기를 나눠보세요.');
    await userEvent.type(body, ' 오버레이');
    expect(args.onBodyChange).toHaveBeenLastCalledWith(
      '오늘의 코스모 이야기를 나눠보세요. 오버레이',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: '콘텐츠 경고 켜기' }));
    expect(args.onContentWarningToggle).toHaveBeenCalledOnce();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '콘텐츠 경고' }), '스포일러');
    expect(args.onContentWarningChange).toHaveBeenLastCalledWith('스포일러');

    await userEvent.click(within(dialog).getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(args.onMediaEdit).toHaveBeenLastCalledWith('ready', 'alt');
    expect(within(dialog).getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '완료' }));
    expect(within(dialog).getByRole('textbox', { name: '게시물 내용' })).toHaveValue(
      '오늘의 코스모 이야기를 나눠보세요. 오버레이',
    );

    await userEvent.click(
      within(dialog).getByRole('button', { name: '3번째 이미지 업로드 다시 시도' }),
    );
    expect(args.onMediaRetry).toHaveBeenLastCalledWith('failed');
    await userEvent.click(within(dialog).getByRole('button', { name: '첨부 이미지 1 제거' }));
    expect(args.onMediaRemove).toHaveBeenLastCalledWith('uploading');

    await userEvent.click(within(dialog).getByRole('button', { name: '이모지 추가' }));
    expect(args.onEmojiAction).toHaveBeenCalledOnce();
    expect(page.getByRole('dialog', { name: '반응 선택' })).toBeVisible();
    await userEvent.click(page.getAllByRole('button', { name: '빨간 하트 ❤️' })[0]);
    expect(within(dialog).getByRole('textbox', { name: '게시물 내용' })).toHaveValue(
      '오늘의 코스모 이야기를 나눠보세요. 오버레이❤️',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: '글쓰기 닫기' }));
    expect(page.queryByRole('dialog', { name: '글쓰기' })).toBeNull();
    expect(railBody).toHaveValue('오늘의 코스모 이야기를 나눠보세요. 오버레이❤️');
  },
  render: (args) => <InteractiveComposer {...args} />,
};

export const PendingMediaContract: Story = {
  args: { body: '업로드 중인 미디어가 있어요.', items: composerMedia },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByRole('button', { name: '게시' })).toBeDisabled();
  },
};

export const MobileCandidateContract: Story = {
  ...MobileEmpty,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('mobile-fullscreen-composer-candidate')).toHaveStyle({
      height: '844px',
      width: '390px',
    });
    expect(canvas.getByRole('heading', { name: '글쓰기' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '글쓰기 닫기' })).toBeVisible();
    expect(canvas.getAllByRole('button', { name: '게시' })).toHaveLength(1);
    expect(canvas.getByLabelText('남은 글자 수 500자')).toBeVisible();
    expect(canvas.getByTestId('post-composer-progress-ring')).toBeVisible();
    expect(canvas.queryByRole('button', { name: 'Composer 확장' })).not.toBeInTheDocument();
  },
};

export const MobileFlexLayoutContract: Story = {
  ...MobileEmpty,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByTestId('mobile-composer-body');
    const editor = canvas.getByRole('textbox', { name: '게시물 내용' });

    expect(body).toHaveStyle({ gap: '8px' });
    expect(getComputedStyle(body).overflow).toBe('visible');
    expect(getComputedStyle(editor).flexGrow).toBe('1');
  },
};

export const MobilePlaygroundContract: Story = {
  ...MobilePlayground,
  play: async ({ args, canvasElement }) => {
    args.onVisibilityChange.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }));

    const menu = canvas.getByRole('radiogroup', { name: '공개 범위 선택' });
    const trigger = canvas.getByRole('button', { name: '공개 범위: 조용한 공개' });
    expect(within(menu).getAllByRole('radio')).toHaveLength(3);
    expect(menu.getBoundingClientRect().right).toBe(trigger.getBoundingClientRect().right);

    await userEvent.click(within(menu).getByRole('radio', { name: '공개' }));
    expect(args.onVisibilityChange).toHaveBeenLastCalledWith('PUBLIC');
    expect(canvas.getByRole('button', { name: '공개 범위: 공개' })).toBeVisible();
    expect(canvas.queryByRole('radiogroup', { name: '공개 범위 선택' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 편집' }));
    expect(canvas.getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(canvas.getByTestId('mobile-composer-media-editor-keyboard')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '선택한 첨부 이미지 1 미리보기' }));
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '완료' }));
    expect(canvas.getByRole('heading', { name: '글쓰기' })).toBeVisible();
  },
};

export const RailProgressRingContract: Story = {
  ...Playground,
  args: { body: '레일 진행률', items: [], remaining: 250, surface: 'rail' },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByTestId('post-composer-progress-ring')).toBeNull();
  },
};

export const OverlayProgressRingContract: Story = {
  ...Playground,
  args: { body: '오버레이 진행률', items: [], remaining: 250, surface: 'overlay' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ring = canvas.getByTestId('post-composer-progress-ring');
    const submit = canvas.getByRole('button', { name: '게시' });

    expect(ring).toBeVisible();
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    expect(ring.querySelectorAll('circle')).toHaveLength(2);
    expect(ring.querySelectorAll('circle')[1]).toHaveAttribute('stroke', '#AE8512');
    expect(ring.parentElement?.lastElementChild).toBe(submit);
  },
};

export const ProgressRingToneContract: Story = {
  ...Playground,
  render: (args) => (
    <View style={{ gap: space[16] }}>
      <PostComposerTarget {...args} body="일반" items={[]} remaining={250} surface="overlay" />
      <PostComposerTarget {...args} body="경고" items={[]} remaining={100} surface="overlay" />
      <PostComposerTarget {...args} body="위험" items={[]} remaining={0} surface="overlay" />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const rings = within(canvasElement).getAllByTestId('post-composer-progress-ring');
    expect(rings).toHaveLength(3);
    expect(rings[0].querySelectorAll('circle')[1]).toHaveAttribute('stroke', '#AE8512');
    expect(rings[1].querySelectorAll('circle')[1]).toHaveAttribute('stroke', '#CF6D2F');
    expect(rings[2].querySelectorAll('circle')[1]).toHaveAttribute('stroke', '#B42318');
  },
};

export const SubmittingSpinnerContract: Story = {
  ...Submitting,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', { name: '게시' });

    expect(submit).toBeDisabled();
    expect(canvas.getByLabelText('게시 처리 중')).toBeVisible();
    expect(canvas.queryByText('게시 중')).toBeNull();
  },
};

export const MobileMediaFooterGeometryContract: Story = {
  ...MobilePlayground,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 1개');
    const shelf = gallery.parentElement;
    const footer = shelf?.nextElementSibling;

    expect(shelf).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(shelf).toHaveStyle({ height: '164px', paddingBottom: '8px' });
    expect(footer!.getBoundingClientRect().top - gallery.getBoundingClientRect().bottom).toBe(8);
  },
};

export const MobileKeyboardMediaFooterGeometryContract: Story = {
  ...MobileKeyboardMedia,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 1개');
    const shelf = gallery.parentElement;
    const footer = shelf?.nextElementSibling;

    expect(shelf).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(shelf).toHaveStyle({ height: '164px', paddingBottom: '8px' });
    expect(footer!.getBoundingClientRect().top - gallery.getBoundingClientRect().bottom).toBe(8);
  },
};

export const MobileKeyboardMediaEditorGeometryContract: Story = {
  ...MobileKeyboardMedia,
  play: async ({ canvasElement }) => {
    expectMobileEditorFitsMediaShelf(canvasElement);
  },
};

export const MobileKeyboardCWEditorGeometryContract: Story = {
  ...MobileKeyboardCW,
  args: {
    contentWarning: '스포일러가 포함되어 있어요.',
    contentWarningExpanded: true,
    items: readyComposerMedia,
    surface: 'overlay',
  },
  play: async ({ canvasElement }) => {
    expectMobileEditorFitsMediaShelf(canvasElement);
  },
};

export const MobileKeyboardContract: Story = {
  ...MobileKeyboardMedia,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByTestId('illustrative-system-keyboard')).toHaveStyle({
      height: '336px',
    });
  },
};

function expectMobileEditorFitsMediaShelf(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const editor = canvas.getByRole('textbox', { name: '게시물 내용' });
  const shelf = canvas.getByLabelText('첨부 이미지 갤러리, 1개').parentElement;

  expect(getComputedStyle(editor).flexGrow).toBe('1');
  expect(shelf).not.toBeNull();
  expect(editor.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    shelf!.getBoundingClientRect().top,
  );
}

const styles = StyleSheet.create({
  author: { alignItems: 'center', flexDirection: 'row', gap: space[12] },
  authorCopy: { flex: 1 },
  authorHandle: textStyles.uiCopyM,
  authorName: textStyles.uiLabelL,
  composition: { alignItems: 'center', width: '100%' },
  mobilePicker: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  overlayClose: { position: 'absolute', right: space[16], top: space[12] },
  pickerDismiss: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  pickerLayer: {
    bottom: 0,
    left: 0,
    position: 'fixed' as never,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  pickerPanel: { position: 'absolute', zIndex: 1 },
  mobilePickerPanel: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  railMediaFixture: { maxWidth: 326, width: '100%' },
  overlayContent: { width: '100%' },
  overlayHeader: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    height: 64,
    justifyContent: 'center',
    width: '100%',
  },
  overlayTitle: textStyles.uiHeadingS,
});
