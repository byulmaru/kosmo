import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ComposerMediaEditor } from '@/components/post/ComposerMediaEditor';
import {
  MobileFullscreenComposerShellCandidate,
  PostComposer,
} from '@/components/post/PostComposer';
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
import type { PostComposerProps } from '@/components/post/PostComposer';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';

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
  component: PostComposer,
  excludeStories: [
    'ActionSemanticsContract',
    'InteractionContract',
    'MobileCandidateContract',
    'MobileReplyShellContract',
    'MobileKeyboardMediaFooterGeometryContract',
    'MobileKeyboardContract',
    'MobileKeyboardCWEditorGeometryContract',
    'MobileKeyboardMediaEditorGeometryContract',
    'MobileMediaFooterGeometryContract',
    'MobilePlaygroundContract',
    'MobileRuntimeAltEditorContract',
    'MobileFlexLayoutContract',
    'OverlayGeometryContract',
    'OverlayProgressRingContract',
    'PendingMediaContract',
    'ProgressRingToneContract',
    'RailProgressRingContract',
    'RailBodyMaxHeightContract',
    'RailFocusBoundaryContract',
    'SubmittingSpinnerContract',
    'SubmittingPickerContract',
    'SubmittingVisibilityContract',
    'WebModalLayoutContract',
    'composerMedia',
  ],
  parameters: { controls: { disable: true }, layout: 'centered' },
  title: 'KOSMO/Patterns/Post Composer',
} satisfies Meta<typeof PostComposer>;

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

export const OverlayFourMediaCW: Story = {
  args: {
    body: '긴 본문\n'.repeat(35).trim(),
    contentWarning: '민감한 내용',
    contentWarningExpanded: true,
    items: [0, 1, 2, 3].map((index) => ({
      ...readyComposerMedia[0],
      key: `ready-${index}`,
      mediaId: `media-ready-${index}`,
    })),
    remaining: 320,
    surface: 'overlay',
  },
  render: (args) => (
    <View style={{ width: 600 }}>
      <InteractiveComposer {...args} />
    </View>
  ),
};

export const Submitting: Story = { args: { items: [], submitting: true } };
export const Error: Story = {
  args: { body: '미디어 업로드 실패를 확인할 본문', items: [composerMedia[2]] },
};

export const SubmitFailure: Story = {
  args: { body: '제출 실패를 확인할 본문', items: [], surface: 'rail' },
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

function SubmitFailureComposer(props: PostComposerProps) {
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
}: PostComposerProps & { keyboard?: boolean; mobile?: boolean }) {
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
  const pickerTriggerRef = useRef<HTMLElement | null>(null);
  const [pickerPosition, setPickerPosition] = useState({
    height: 624,
    left: space[8] as number,
    top: space[8] as number,
  });
  const remaining =
    postBodyMaxLength -
    normalizePostContentPlainText(body).length -
    normalizePostContentPlainText(contentWarning).length;
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    pickerTriggerRef.current?.focus();
  }, []);
  const togglePicker = () => {
    props.onEmojiAction();
    if (pickerOpen) {
      closePicker();
    } else {
      setPickerOpen(true);
    }
  };

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
    if (props.submitting) {
      setPickerOpen(false);
    }
  }, [props.submitting]);
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
    pickerTriggerRef.current = trigger;

    const bounds = trigger.getBoundingClientRect();
    const panelWidth = 360;
    const preferredPanelHeight = 624;
    const gap = space[8];
    const panelHeight = Math.min(
      preferredPanelHeight,
      Math.max(0, storyWindow.innerHeight - gap * 2),
    );
    const maxLeft = Math.max(gap, storyWindow.innerWidth - panelWidth - gap);
    const maxTop = Math.max(gap, storyWindow.innerHeight - panelHeight - gap);
    setPickerPosition({
      height: panelHeight,
      left: Math.min(Math.max(gap, bounds.right - panelWidth), maxLeft),
      top: Math.min(
        storyWindow.innerHeight - bounds.bottom >= panelHeight + gap
          ? bounds.bottom + gap
          : Math.max(gap, bounds.top - panelHeight - gap),
        maxTop,
      ),
    });
  }, [mobile, pickerOpen]);
  const closeOverlay = () => {
    setEditor(null);
    setOverlayOpen(false);
    setPickerOpen(false);
  };

  const shouldShowPicker = pickerOpen && !props.submitting;
  const picker = shouldShowPicker ? (
    <View pointerEvents="box-none" style={mobile ? styles.mobilePicker : styles.pickerLayer}>
      {!mobile ? (
        <Pressable
          accessibilityLabel="반응 선택 닫기"
          accessibilityRole="button"
          onPress={closePicker}
          style={styles.pickerDismiss}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.pickerPanel,
          mobile
            ? styles.mobilePickerPanel
            : {
                height: pickerPosition.height,
                left: pickerPosition.left,
                top: pickerPosition.top,
              },
        ]}
        testID="post-composer-emoji-picker"
      >
        <FullReactionPicker
          onClose={closePicker}
          onQueryChange={setPickerQuery}
          onSelect={(option) => {
            if (props.submitting) {
              return;
            }
            const value = `${body}${option.emoji}`;
            props.onBodyChange(value);
            setBody(value);
            closePicker();
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
          onEmojiAction={togglePicker}
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
        <View style={props.surface === 'rail' ? styles.railTarget : styles.overlayTarget}>
          <PostComposer
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
            onEmojiAction={togglePicker}
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
        </View>
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
              <PostComposer
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
                onEmojiAction={togglePicker}
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

function SubmittingPickerComposer(props: PostComposerProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <InteractiveComposer
      {...props}
      onSubmit={() => {
        props.onSubmit();
        setSubmitting(true);
      }}
      submitting={submitting}
    />
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
    const railBody = canvas.getByRole('textbox', { name: '게시글 본문' });

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
    const body = within(dialog).getByRole('textbox', { name: '게시글 본문' });
    expect(body).toHaveValue('오늘의 코스모 이야기를 나눠보세요.');
    await userEvent.type(body, ' 오버레이');
    expect(args.onBodyChange).toHaveBeenLastCalledWith(
      '오늘의 코스모 이야기를 나눠보세요. 오버레이',
    );
    const focusedBody = getComputedStyle(body);
    const bodyBorderWidth = focusedBody.borderWidth;
    expect(bodyBorderWidth).toBe('0px');
    expect(focusedBody.outlineWidth).toBe('0px');

    await userEvent.click(within(dialog).getByRole('button', { name: '콘텐츠 경고 켜기' }));
    await waitFor(() => expect(body).not.toHaveFocus());
    expect(getComputedStyle(body).borderWidth).toBe(bodyBorderWidth);
    expect(getComputedStyle(body).outlineWidth).toBe('0px');
    expect(args.onContentWarningToggle).toHaveBeenCalledOnce();
    const contentWarning = within(dialog).getByRole('textbox', { name: '콘텐츠 경고' });
    await userEvent.type(contentWarning, '스포일러');
    expect(args.onContentWarningChange).toHaveBeenLastCalledWith('스포일러');
    const focusedContentWarning = getComputedStyle(contentWarning);
    const contentWarningBorderWidth = focusedContentWarning.borderWidth;
    expect(contentWarningBorderWidth).toBe('1px');
    expect(focusedContentWarning.outlineWidth).toBe('0px');
    await userEvent.click(body);
    await waitFor(() => expect(contentWarning).not.toHaveFocus());
    expect(getComputedStyle(contentWarning).borderWidth).toBe(contentWarningBorderWidth);
    expect(getComputedStyle(contentWarning).outlineWidth).toBe('0px');

    await userEvent.click(within(dialog).getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(args.onMediaEdit).toHaveBeenLastCalledWith('ready', 'alt');
    expect(within(dialog).getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '완료' }));
    expect(within(dialog).getByRole('textbox', { name: '게시글 본문' })).toHaveValue(
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
    page.getAllByRole('button', { name: '감동 🥹' })[0].focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog', { name: '반응 선택' })).toBeNull());
    expect(page.getByRole('dialog', { name: '글쓰기' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '이모지 추가' })).toHaveFocus();

    await userEvent.click(within(dialog).getByRole('button', { name: '이모지 추가' }));
    await userEvent.click(page.getAllByRole('button', { name: '빨간 하트 ❤️' })[0]);
    expect(within(dialog).getByRole('textbox', { name: '게시글 본문' })).toHaveValue(
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

export const ActionSemanticsContract: Story = {
  args: { body: 'Composer 동작 의미 검증', items: [], showPollAction: true, surface: 'rail' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const name of [/^이미지 추가/, '투표 추가', '이모지 추가']) {
      expect(canvas.getByRole('button', { name })).not.toHaveAttribute('aria-pressed');
    }
    expect(canvas.getByRole('button', { name: '콘텐츠 경고 켜기' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
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
    const submit = canvas.getByRole('button', { name: '게시' });
    expect(canvas.getAllByRole('button', { name: '게시' })).toHaveLength(1);
    expect(submit.getBoundingClientRect().height).toBe(40);
    expect(submit.getBoundingClientRect().width).toBe(72);
    expect(canvas.getByLabelText('남은 글자 수 500자')).toBeVisible();
    expect(canvas.getByTestId('post-composer-progress-ring')).toBeVisible();
    expect(canvas.queryByRole('button', { name: 'Composer 확장' })).not.toBeInTheDocument();
    expect(canvas.queryByTestId('illustrative-system-keyboard')).toBeNull();
  },
};

export const MobileReplyShellContract: Story = {
  ...MobileEmpty,
  args: { ...MobileEmpty.args, body: '', items: [], mode: 'reply' },
  render: (args) => {
    const [parentResized, setParentResized] = useState(false);
    return (
      <>
        <MobileFullscreenComposerShellCandidate
          {...args}
          beforeEditor={
            <View style={{ height: parentResized ? 260 : 180 }} testID="mobile-reply-parent">
              <Text>부모 게시글</Text>
            </View>
          }
          mode="reply"
          onOverlayClose={onMobileClose}
          replyContext={<Text testID="mobile-reply-context">@reply-target님에게 답글</Text>}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="부모 게시글 높이 변경"
          onPress={() => setParentResized(true)}
          testID="mobile-reply-parent-resize"
        >
          <Text>Parent resize test</Text>
        </Pressable>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroll = canvas.getByTestId('mobile-fullscreen-composer-scroll');
    const parent = canvas.getByTestId('mobile-reply-parent');
    const visibility = canvas.getByRole('button', { name: '공개 범위: 조용한 공개' });
    const body = canvas.getByRole('textbox', { name: '답글 본문' });

    expect(scroll).toContainElement(parent);
    expect(scroll).toContainElement(visibility);
    await waitFor(() =>
      expect(parent.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scroll.getBoundingClientRect().top + 1,
      ),
    );
    await userEvent.click(canvas.getByRole('button', { name: '부모 게시글 높이 변경' }));
    await waitFor(() =>
      expect(parent.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scroll.getBoundingClientRect().top + 1,
      ),
    );
    scroll.scrollTop = 0;
    scroll.dispatchEvent(new Event('scroll'));
    await waitFor(() =>
      expect(parent.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        scroll.getBoundingClientRect().top - 1,
      ),
    );
    expect(body).toHaveAttribute('placeholder', '무슨 일이 일어나고 있나요?');
    expect(canvas.queryByTestId('mobile-reply-context')).toBeNull();

    await userEvent.click(body);
    expect(canvas.getByTestId('mobile-reply-context')).toHaveTextContent(
      '@reply-target님에게 답글',
    );
  },
};

export const MobileFlexLayoutContract: Story = {
  ...MobileEmpty,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByTestId('mobile-composer-body');
    const editor = canvas.getByRole('textbox', { name: '게시글 본문' });

    expect(body).toHaveStyle({ gap: '8px' });
    expect(getComputedStyle(body).overflow).toBe('visible');
    expect(getComputedStyle(editor).flexGrow).toBe('1');

    await userEvent.click(editor);
    await waitFor(() => expect(editor).toHaveFocus());
    await userEvent.type(editor, '모바일 입력');
    const focusedStyle = getComputedStyle(editor);
    const borderWidth = focusedStyle.borderWidth;
    expect(borderWidth).toBe('0px');
    expect(focusedStyle.outlineStyle).toBe('solid');
    expect(focusedStyle.outlineWidth).toBe('0px');

    await userEvent.click(canvas.getByRole('button', { name: '글쓰기 닫기' }));
    await waitFor(() => expect(editor).not.toHaveFocus());
    expect(getComputedStyle(editor).borderWidth).toBe(borderWidth);
    expect(getComputedStyle(editor).outlineWidth).toBe('0px');
    expect(editor).toHaveValue('모바일 입력');
  },
};

export const MobilePlaygroundContract: Story = {
  ...MobilePlayground,
  play: async ({ args, canvasElement }) => {
    args.onVisibilityChange.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }));

    const menu = canvas.getByRole('menu', { name: '공개 범위 선택' });
    const trigger = canvas.getByRole('button', { name: '공개 범위: 조용한 공개' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(3);
    expect(menu.getBoundingClientRect().right).toBe(trigger.getBoundingClientRect().right - 16);

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: '공개' }));
    expect(args.onVisibilityChange).toHaveBeenLastCalledWith('PUBLIC');
    expect(canvas.getByRole('button', { name: '공개 범위: 공개' })).toBeVisible();
    expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 편집' }));
    expect(canvas.getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(canvas.getByTestId('mobile-composer-media-editor-keyboard')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '선택한 첨부 이미지 1 미리보기' }));
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '완료' }));
    expect(canvas.getByRole('heading', { name: '글쓰기' })).toBeVisible();
  },
};

export const MobileRuntimeAltEditorContract: Story = {
  render: () => (
    <ComposerMediaEditor
      media={readyComposerMedia}
      mobileState="alt"
      onAltTextChange={fn()}
      onBack={fn()}
      onClose={fn()}
      onDone={fn()}
      onSelectMedia={fn()}
      onSensitiveMediaChange={fn()}
      onToolChange={fn()}
      presentation="mobile"
      selectedKey="ready"
      sensitiveMedia={false}
      tool="alt"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '미디어 편집에서 뒤로' })).toHaveFocus(),
    );
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toBeVisible();
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();
    expect(canvas.queryByTestId('illustrative-system-keyboard')).toBeNull();
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
    const remaining = canvas.getByLabelText(/남은 글자 수 \d+자/);
    const ring = canvas.getByTestId('post-composer-progress-ring');
    const submit = canvas.getByRole('button', { name: '게시' });

    expect(getComputedStyle(remaining).textAlign).toBe('right');
    expect(ring).toBeVisible();
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    expect(ring.querySelectorAll('circle')).toHaveLength(2);
    expect(ring.querySelectorAll('circle')[1]).toHaveAttribute('stroke', '#AE8512');
    expect(ring.parentElement?.lastElementChild).toBe(submit);
  },
};

export const OverlayGeometryContract: Story = {
  ...Playground,
  args: {
    body: '오버레이 외곽 높이를 유지할 본문',
    contentWarning: '',
    contentWarningExpanded: false,
    items: readyComposerMedia.slice(0, 1),
    remaining: 500,
    surface: 'overlay',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const target = canvas.getByTestId('post-composer-target');
    const visibilityTrigger = canvas.getByRole('button', { name: '공개 범위: 조용한 공개' });
    const submit = canvas.getByRole('button', { name: '게시' });
    const scroll = canvas.getByTestId('post-composer-scroll');
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 1개');
    const galleryShell = gallery.parentElement!;
    const content = galleryShell.parentElement!;
    const initialTargetHeight = target.getBoundingClientRect().height;
    const initialTargetTop = target.getBoundingClientRect().top;
    const initialSubmitTop = submit.getBoundingClientRect().top;

    expect(initialTargetHeight).toBeLessThan(560);
    expect(body.getBoundingClientRect().height).toBe(100);
    expect(gallery.getBoundingClientRect().top).toBeCloseTo(
      body.getBoundingClientRect().bottom + space[12],
      0,
    );
    expect(content.getBoundingClientRect().height).toBeCloseTo(
      body.getBoundingClientRect().height + space[12] + galleryShell.getBoundingClientRect().height,
      0,
    );
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);
    scroll.scrollTop = 1;
    expect(scroll.scrollTop).toBe(0);

    await userEvent.click(canvas.getByRole('button', { name: '콘텐츠 경고 켜기' }));
    const contentWarning = canvas.getByRole('textbox', { name: '콘텐츠 경고' });
    const contentWarningTop = contentWarning.getBoundingClientRect().top;

    expect(target.getBoundingClientRect().height).toBeGreaterThan(initialTargetHeight);
    expect(scroll.scrollTop).toBe(0);
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);
    expect(contentWarningTop).toBeLessThan(visibilityTrigger.getBoundingClientRect().top);
    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    scroll.scrollTop = 0;

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 제거' }));

    expect(target.getBoundingClientRect().top).toBe(initialTargetTop);
    expect(target.getBoundingClientRect().height).toBeLessThan(initialTargetHeight);
    expect(visibilityTrigger.getBoundingClientRect().bottom).toBeCloseTo(
      canvas.getByTestId('post-composer-footer').getBoundingClientRect().top,
      0,
    );
    expect(submit.getBoundingClientRect().top).toBeLessThan(initialSubmitTop);
    expect(contentWarning.getBoundingClientRect().top).toBe(contentWarningTop);
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);

    await userEvent.click(body);
    await userEvent.clear(body);
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);
    await userEvent.click(canvas.getByRole('button', { name: '콘텐츠 경고 끄기' }));
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);
  },
};

export const WebModalLayoutContract: Story = {
  ...Playground,
  args: {
    body: '웹 모달 레이아웃을 확인할 본문',
    items: [],
    surface: 'overlay',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const author = canvas.getByTestId('post-composer-author');
    const visibility = canvas.getByRole('button', { name: '공개 범위: 조용한 공개' });
    const editor = canvas.getByTestId('post-composer-editor');
    const scroll = canvas.getByTestId('post-composer-scroll');
    const footer = canvas.getByTestId('post-composer-footer');
    const target = canvas.getByTestId('post-composer-target');

    expect(within(visibility).getByText('공개 범위')).toBeVisible();
    expect(within(visibility).getByText('조용한 공개')).toBeVisible();
    expect(getComputedStyle(editor).borderWidth).toBe('0px');
    expect(scroll.contains(editor)).toBe(true);
    expect(scroll.contains(author)).toBe(true);
    expect(scroll.contains(visibility)).toBe(false);
    expect(scroll.contains(footer)).toBe(false);
    expect(visibility.getBoundingClientRect().top).toBeCloseTo(
      scroll.getBoundingClientRect().bottom,
      0,
    );
    expect(visibility.getBoundingClientRect().bottom).toBeCloseTo(
      footer.getBoundingClientRect().top,
      0,
    );
    expect(visibility.getBoundingClientRect().left).toBeCloseTo(
      footer.getBoundingClientRect().left,
      0,
    );
    expect(visibility.getBoundingClientRect().right).toBeCloseTo(
      footer.getBoundingClientRect().right,
      0,
    );
    expect(target.getBoundingClientRect().height).toBeLessThan(380);
    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(
      target.getBoundingClientRect().bottom,
      0,
    );
    expect(footer.getBoundingClientRect().left).toBeCloseTo(target.getBoundingClientRect().left, 0);
    expect(footer.getBoundingClientRect().right).toBeCloseTo(
      target.getBoundingClientRect().right,
      0,
    );

    await userEvent.click(visibility);
    const menu = canvas.getByRole('menu', { name: '공개 범위 선택' });
    expect(menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      visibility.getBoundingClientRect().top,
    );
    expect(menu.getBoundingClientRect().right).toBeCloseTo(
      visibility.getBoundingClientRect().right - space[16],
      0,
    );
    await userEvent.keyboard('{Escape}');
    expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull();
    expect(visibility).toHaveFocus();
  },
};

export const RailGeometryContract: Story = {
  ...Playground,
  args: {
    body: '레일 외곽 높이를 유지할 본문',
    contentWarning: '경고 문구',
    contentWarningExpanded: true,
    items: readyComposerMedia.slice(0, 1),
    surface: 'rail',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const target = canvas.getByTestId('post-composer-target');
    const scroll = canvas.getByTestId('post-composer-scroll');
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    const expand = canvas.getByRole('button', { name: 'Composer 확장' });
    const visibility = canvas.getByRole('button', { name: '공개 범위: 조용한 공개' });
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 1개');
    const initialTargetHeight = target.getBoundingClientRect().height;
    const visibilityTop = visibility.getBoundingClientRect().top;
    const submitTop = canvas.getByRole('button', { name: '게시' }).getBoundingClientRect().top;

    expect(body.getBoundingClientRect().height).toBe(100);
    expect(initialTargetHeight).toBeGreaterThan(420);
    expect(gallery.getBoundingClientRect().height).toBe(112);
    expect(scroll.contains(gallery)).toBe(false);
    expect(gallery.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      scroll.getBoundingClientRect().bottom,
    );
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);
    scroll.scrollTop = 1;
    expect(scroll.scrollTop).toBe(0);
    expect(visibility.getBoundingClientRect().left).toBeCloseTo(
      body.getBoundingClientRect().left,
      0,
    );
    expect(expand.firstElementChild?.getBoundingClientRect().right).toBeCloseTo(
      body.getBoundingClientRect().right,
      0,
    );
    const contentWarning = canvas.getByRole('textbox', { name: '콘텐츠 경고' });
    expect(contentWarning.getBoundingClientRect().top).toBeCloseTo(
      visibility.getBoundingClientRect().bottom + space[12],
      0,
    );

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 제거' }));
    await userEvent.click(canvas.getByRole('button', { name: '콘텐츠 경고 끄기' }));

    expect(target.getBoundingClientRect().height).toBeLessThan(initialTargetHeight);
    expect(
      canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }).getBoundingClientRect().top,
    ).toBe(visibilityTop);
    expect(canvas.getByRole('button', { name: '게시' }).getBoundingClientRect().top).toBeLessThan(
      submitTop,
    );
  },
};

export const RailFocusBoundaryContract: Story = {
  ...RailEmptyPublic,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    const editor = canvas.getByTestId('post-composer-editor');
    const baselineBorderColor = getComputedStyle(editor).borderColor;

    await userEvent.click(body);
    await waitFor(() => expect(body).toHaveFocus());
    expect(getComputedStyle(editor).borderColor).toBe('rgb(252, 231, 154)');

    body.blur();
    await waitFor(() => expect(body).not.toHaveFocus());
    expect(getComputedStyle(editor).borderColor).toBe(baselineBorderColor);
  },
};

export const RailBodyMaxHeightContract: Story = {
  ...RailEmptyPublic,
  args: { ...RailEmptyPublic.args, body: '긴 본문\n'.repeat(40) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    const scroll = canvas.getByTestId('post-composer-scroll');

    await waitFor(() => expect(body.getBoundingClientRect().height).toBe(300));
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    expect(scroll.scrollHeight).toBe(scroll.clientHeight);
    scroll.scrollTop = 1;
    expect(scroll.scrollTop).toBe(0);
  },
};

export const ProgressRingToneContract: Story = {
  ...Playground,
  render: (args) => (
    <View style={{ gap: space[16] }}>
      <PostComposer {...args} body="일반" items={[]} remaining={250} surface="overlay" />
      <PostComposer {...args} body="경고" items={[]} remaining={100} surface="overlay" />
      <PostComposer {...args} body="위험" items={[]} remaining={0} surface="overlay" />
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

export const SubmittingPickerContract: Story = {
  ...Playground,
  args: { body: '제출 전 이모지 선택', items: [], surface: 'rail' },
  render: (args) => <SubmittingPickerComposer {...args} />,
  play: async ({ args, canvasElement }) => {
    args.onBodyChange.mockClear();
    args.onSubmit.mockClear();
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });

    await userEvent.click(canvas.getByRole('button', { name: '이모지 추가' }));
    expect(await canvas.findByTestId('post-composer-emoji-picker')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await waitFor(() => expect(canvas.queryByTestId('post-composer-emoji-picker')).toBeNull());

    expect(canvas.getByRole('button', { name: '게시' })).toBeDisabled();
    expect(body).toHaveValue('제출 전 이모지 선택');
    expect(args.onBodyChange).not.toHaveBeenCalled();
    expect(args.onSubmit).toHaveBeenCalledOnce();
  },
};

export const SubmittingVisibilityContract: Story = {
  ...Playground,
  args: { body: '제출 전 공개 범위', items: [], surface: 'rail' },
  render: (args) => <SubmittingPickerComposer {...args} />,
  play: async ({ args, canvasElement }) => {
    args.onSubmit.mockClear();
    args.onVisibilityChange.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }));
    expect(canvas.getByRole('menu', { name: '공개 범위 선택' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await waitFor(() => expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull());

    expect(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' })).toBeDisabled();
    expect(args.onVisibilityChange).not.toHaveBeenCalled();
    expect(args.onSubmit).toHaveBeenCalledOnce();
  },
};

export const MobileMediaFooterGeometryContract: Story = {
  ...MobilePlayground,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 1개');
    const shelf = canvas.getByTestId('mobile-composer-media-shelf');
    const footer = canvas.getByTestId('mobile-composer-footer');

    expect(shelf).toHaveStyle({ height: '164px', paddingBottom: '8px' });
    expect(footer.getBoundingClientRect().top - gallery.getBoundingClientRect().bottom).toBe(8);
  },
};

export const MobileKeyboardMediaFooterGeometryContract: Story = {
  ...MobileKeyboardMedia,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 1개');
    const shelf = canvas.getByTestId('mobile-composer-media-shelf');
    const footer = canvas.getByTestId('mobile-composer-footer');

    expect(shelf).toHaveStyle({ height: '164px', paddingBottom: '8px' });
    expect(footer.getBoundingClientRect().top - gallery.getBoundingClientRect().bottom).toBe(8);
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
    const canvas = within(canvasElement);
    const contentWarning = canvas.getByRole('textbox', { name: '콘텐츠 경고' });
    await userEvent.click(contentWarning);
    await waitFor(() => expect(contentWarning).toHaveFocus());
    await userEvent.type(contentWarning, ' 추가');
    const focusedStyle = getComputedStyle(contentWarning);
    const borderWidth = focusedStyle.borderWidth;
    expect(borderWidth).toBe('1px');
    expect(focusedStyle.outlineWidth).toBe('0px');

    await userEvent.click(canvas.getByRole('textbox', { name: '게시글 본문' }));
    await waitFor(() => expect(contentWarning).not.toHaveFocus());
    expect(getComputedStyle(contentWarning).borderWidth).toBe(borderWidth);
    expect(getComputedStyle(contentWarning).outlineWidth).toBe('0px');
    expect(contentWarning).toHaveValue('스포일러가 포함되어 있어요. 추가');
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
  const editor = canvas.getByRole('textbox', { name: '게시글 본문' });
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
  railTarget: { maxWidth: 326, width: '100%' },
  railMediaFixture: { maxWidth: 326, width: '100%' },
  overlayTarget: { maxWidth: 600, width: '100%' },
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
