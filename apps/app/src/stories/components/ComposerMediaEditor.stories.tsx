import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ComposerMediaEditor } from '@/components/post/ComposerMediaEditor';
import ogImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerMediaEditorProps } from '@/components/post/ComposerMediaEditor';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';

export const editorMedia: readonly ComposerMediaItem[] = [
  {
    altText: '노을빛 밤하늘 아래 모인 사람들',
    asset: { height: 390, uri: ogImage, width: 560 },
    key: 'media-1',
    mediaId: 'media-1',
    state: 'ready',
  },
  {
    altText: '',
    asset: { height: 390, uri: ogImage, width: 560 },
    key: 'media-2',
    mediaId: 'media-2',
    state: 'ready',
  },
];

const meta = {
  args: {
    media: editorMedia,
    mobileState: undefined,
    onAltTextChange: fn(),
    onBack: fn(),
    onClose: fn(),
    onDone: fn(),
    onSelectMedia: fn(),
    onSensitiveMediaChange: fn(),
    onToolChange: fn(),
    presentation: 'web',
    selectedKey: 'media-1',
    sensitiveMedia: false,
    showImageEditPreview: false,
    tool: 'alt',
  },
  argTypes: {
    media: { control: 'object' },
    mobileState: {
      control: 'select',
      options: ['default', 'altKeyboard', 'sensitive'],
    },
    onAltTextChange: { action: 'altTextChange', control: false },
    onBack: { action: 'back', control: false },
    onClose: { action: 'close', control: false },
    onDone: { action: 'done', control: false },
    onSelectMedia: { action: 'selectMedia', control: false },
    onSensitiveMediaChange: { action: 'sensitiveMediaChange', control: false },
    onToolChange: { action: 'toolChange', control: false },
    presentation: { control: 'inline-radio', options: ['web', 'mobile'] },
    selectedKey: { control: 'select', options: editorMedia.map(({ key }) => key) },
    sensitiveMedia: { control: 'boolean' },
    showImageEditPreview: {
      control: 'boolean',
      name: '미래 이미지 편집 미리보기',
    },
    tool: { control: 'inline-radio', options: ['alt', 'sensitive'] },
  },
  component: ComposerMediaEditor,
  excludeStories: [
    'InteractionContract',
    'FutureImageEditPreviewContract',
    'MobileAltKeyboardGeometryContract',
    'MobileDefaultGeometryContract',
    'MobileSensitiveGeometryContract',
    'MobileToolInteractionContract',
    'editorMedia',
  ],
  parameters: { layout: 'centered' },
  title: 'KOSMO/Components/Composer Media Editor',
} satisfies Meta<typeof ComposerMediaEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: (args) => <WebEditorStory {...args} /> };

export const Sensitive: Story = {
  args: { sensitiveMedia: true, tool: 'sensitive' },
  render: (args) => <WebEditorStory {...args} />,
};

export const CompactWebAlt: Story = {
  render: (args) => (
    <View style={{ width: 720 }}>
      <ComposerMediaEditor {...args} />
    </View>
  ),
};

export const MobileDefault: Story = {
  args: { mobileState: 'default', presentation: 'mobile' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  render: (args) => <InteractiveEditor {...args} />,
};

export const MobileAltKeyboard: Story = {
  args: { mobileState: 'altKeyboard', presentation: 'mobile' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  render: (args) => <InteractiveEditor {...args} />,
};

export const MobileSensitive: Story = {
  args: {
    mobileState: 'sensitive',
    presentation: 'mobile',
    sensitiveMedia: true,
    tool: 'sensitive',
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  render: (args) => <InteractiveEditor {...args} />,
};

function InteractiveEditor(props: ComposerMediaEditorProps) {
  const [media, setMedia] = useState(props.media);
  const [mobileState, setMobileState] = useState(props.mobileState);
  const [selectedKey, setSelectedKey] = useState(props.selectedKey);
  const [sensitiveMedia, setSensitiveMedia] = useState(props.sensitiveMedia);
  const [tool, setTool] = useState(props.tool);

  useEffect(() => setMedia(props.media), [props.media]);
  useEffect(() => setMobileState(props.mobileState), [props.mobileState]);
  useEffect(() => setSelectedKey(props.selectedKey), [props.selectedKey]);
  useEffect(() => setSensitiveMedia(props.sensitiveMedia), [props.sensitiveMedia]);
  useEffect(() => setTool(props.tool), [props.tool]);

  return (
    <ComposerMediaEditor
      {...props}
      media={media}
      mobileState={mobileState}
      onAltTextChange={(key, altText) => {
        props.onAltTextChange(key, altText);
        setMedia((items) => items.map((item) => (item.key === key ? { ...item, altText } : item)));
      }}
      onSelectMedia={(key) => {
        props.onSelectMedia(key);
        setSelectedKey(key);
      }}
      onSensitiveMediaChange={(value) => {
        props.onSensitiveMediaChange(value);
        setSensitiveMedia(value);
      }}
      onToolChange={(value) => {
        props.onToolChange(value);
        setTool(value);
        if (props.presentation === 'mobile') {
          setMobileState(value === 'alt' ? 'altKeyboard' : 'sensitive');
        }
      }}
      selectedKey={selectedKey}
      sensitiveMedia={sensitiveMedia}
      tool={tool}
    />
  );
}

function WebEditorStory(props: ComposerMediaEditorProps) {
  return (
    <View style={{ width: 920 }}>
      <InteractiveEditor {...props} />
    </View>
  );
}

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onAltTextChange.mockClear();
    args.onBack.mockClear();
    args.onClose.mockClear();
    args.onDone.mockClear();
    args.onSelectMedia.mockClear();
    args.onSensitiveMediaChange.mockClear();
    args.onToolChange.mockClear();
    const canvas = within(canvasElement);

    expect(canvas.getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toHaveValue(
      '노을빛 밤하늘 아래 모인 사람들',
    );
    expect(canvas.getByText('1 / 2')).toBeVisible();
    expect(canvas.queryByRole('tab', { name: '이미지 편집 (준비 중)' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 선택' }));
    expect(args.onSelectMedia).toHaveBeenLastCalledWith('media-2');
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toHaveValue('');

    await userEvent.type(canvas.getByRole('textbox', { name: '이미지 설명' }), '두 번째 이미지');
    expect(args.onAltTextChange).toHaveBeenLastCalledWith('media-2', '두 번째 이미지');

    await userEvent.click(canvas.getByRole('tab', { name: '민감도' }));
    expect(args.onToolChange).toHaveBeenLastCalledWith('sensitive');
    await userEvent.click(canvas.getByRole('switch', { name: '민감한 이미지' }));
    expect(args.onSensitiveMediaChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(canvas.getByRole('button', { name: '완료' }));
    expect(args.onDone).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: '미디어 편집에서 뒤로' }));
    expect(args.onBack).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: '미디어 편집 닫기' }));
    expect(args.onClose).toHaveBeenCalledOnce();
  },
  render: (args) => <WebEditorStory {...args} />,
};

export const FutureImageEditPreviewContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('tab', { name: '이미지 편집 (준비 중)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
  render: (args) => <WebEditorStory {...args} showImageEditPreview />,
};

export const MobileDefaultGeometryContract: Story = {
  ...MobileDefault,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('mobile-composer-media-editor')).toHaveStyle({
      height: '844px',
      width: '390px',
    });
    expect(canvas.queryByTestId('mobile-composer-media-editor-tool-sheet')).toBeNull();
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();
  },
};

export const MobileAltKeyboardGeometryContract: Story = {
  ...MobileAltKeyboard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('mobile-composer-media-editor-tool-sheet')).toHaveStyle({
      height: '176px',
    });
    expect(canvas.getByTestId('mobile-composer-media-editor-keyboard')).toHaveStyle({
      height: '336px',
    });
  },
};

export const MobileSensitiveGeometryContract: Story = {
  ...MobileSensitive,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('mobile-composer-media-editor-tool-sheet')).toHaveStyle({
      height: '184px',
    });
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();
  },
};

export const MobileToolInteractionContract: Story = {
  ...MobileDefault,
  play: async ({ args, canvasElement }) => {
    args.onToolChange.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));

    expect(args.onToolChange).toHaveBeenLastCalledWith('alt');
    expect(canvas.getByTestId('mobile-composer-media-editor-tool-sheet')).toHaveStyle({
      height: '176px',
    });
    expect(canvas.getByTestId('mobile-composer-media-editor-keyboard')).toHaveStyle({
      height: '336px',
    });
  },
};
