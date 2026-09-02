import { XIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ComposerMediaEditor } from '@/components/post/ComposerMediaEditor';
import {
  MobileFullscreenComposerShellCandidate,
  PostComposerTarget,
} from '@/components/post/PostComposerTarget';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
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
    showPollAction: true,
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
    items: { control: 'object' },
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
    remaining: { control: { max: 500, min: -10, step: 1, type: 'range' } },
    sensitiveMedia: { control: 'boolean' },
    showCWAction: { control: 'boolean' },
    showEmojiAction: { control: 'boolean' },
    showMediaAction: { control: 'boolean' },
    showPollAction: { control: 'boolean' },
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
    'MobileMediaFooterGeometryContract',
    'MobilePlaygroundContract',
    'PendingMediaContract',
    'StateContract',
    'composerMedia',
  ],
  parameters: { layout: 'centered' },
  title: 'KOSMO/Patterns/Post Composer Target',
} satisfies Meta<typeof PostComposerTarget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: (args) => <InteractiveComposer {...args} /> };

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
export const Error: Story = { args: { error: '게시글을 작성하지 못했습니다.', items: [] } };

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

function InteractiveComposer({
  keyboard = false,
  mobile = false,
  ...props
}: PostComposerTargetProps & { keyboard?: boolean; mobile?: boolean }) {
  const theme = useTheme();
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

  useEffect(() => setBody(props.body), [props.body]);
  useEffect(() => setContentWarning(props.contentWarning), [props.contentWarning]);
  useEffect(
    () => setContentWarningExpanded(props.contentWarningExpanded),
    [props.contentWarningExpanded],
  );
  useEffect(() => setItems(props.items), [props.items]);
  useEffect(() => setVisibility(props.visibility), [props.visibility]);
  useEffect(() => setSensitiveMedia(props.sensitiveMedia), [props.sensitiveMedia]);

  const closeOverlay = () => {
    setEditor(null);
    setOverlayOpen(false);
    setPickerOpen(false);
  };

  const picker = pickerOpen ? (
    <View style={mobile ? styles.mobilePicker : styles.picker}>
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
          {...props}
          body={body}
          contentWarning={contentWarning}
          contentWarningExpanded={contentWarningExpanded}
          items={items}
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
          {...props}
          body={body}
          contentWarning={contentWarning}
          contentWarningExpanded={contentWarningExpanded}
          items={items}
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
                {...props}
                body={body}
                contentWarning={contentWarning}
                contentWarningExpanded={contentWarningExpanded}
                items={items}
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
    expect(canvas.queryByRole('button', { name: 'Composer 확장' })).not.toBeInTheDocument();
  },
};

export const MobilePlaygroundContract: Story = {
  ...MobilePlayground,
  play: async ({ args, canvasElement }) => {
    args.onVisibilityChange.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }));

    const menu = canvas.getByRole('radiogroup', { name: '공개 범위 선택' });
    expect(within(menu).getAllByRole('radio')).toHaveLength(3);

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

export const MobileKeyboardContract: Story = {
  ...MobileKeyboardMedia,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByTestId('illustrative-system-keyboard')).toHaveStyle({
      height: '336px',
    });
  },
};

export const StateContract: Story = {
  args: { error: '게시글을 작성하지 못했습니다.', items: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('게시글을 작성하지 못했습니다.');
    expect(canvas.getByRole('button', { name: '게시' })).toBeEnabled();
  },
};

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
  picker: { position: 'absolute', right: 0, top: 72, zIndex: 20 },
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
