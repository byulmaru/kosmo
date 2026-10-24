import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { FeatureFlagsContext } from '@/components/FeatureFlagsContext';
import { ComposerMediaEditor } from '@/components/post/ComposerMediaEditor';
import ogImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PropsWithChildren } from 'react';
import type { ComposerMediaEditorProps } from '@/components/post/ComposerMediaEditor';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';

export const editorMedia: readonly ComposerMediaItem[] = [
  {
    applyNightshade: false,
    altText: '노을빛 밤하늘 아래 모인 사람들',
    asset: { height: 390, uri: ogImage, width: 560 },
    key: 'media-1',
    mediaId: 'media-1',
    state: 'ready',
  },
  {
    applyNightshade: false,
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
    onApplyNightshadeChange: fn(),
    onBack: fn(),
    onClose: fn(),
    onDone: fn(),
    onPreviewPress: fn(),
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
      options: ['default', 'alt', 'altKeyboard', 'sensitive', 'nightshade'],
    },
    onAltTextChange: { action: 'altTextChange', control: false },
    onApplyNightshadeChange: { action: 'applyNightshadeChange', control: false },
    onBack: { action: 'back', control: false },
    onClose: { action: 'close', control: false },
    onDone: { action: 'done', control: false },
    onPreviewPress: { action: 'previewPress', control: false },
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
    tool: { control: 'inline-radio', options: ['alt', 'sensitive', 'nightshade'] },
  },
  component: ComposerMediaEditor,
  excludeStories: [
    'InteractionContract',
    'FutureImageEditPreviewContract',
    'MobileAltKeyboardGeometryContract',
    'MobileDefaultGeometryContract',
    'MobileSensitiveGeometryContract',
    'MobileNightshadeGeometryContract',
    'MobileToolInteractionContract',
    'FeatureFlagOffContract',
    'MobileFeatureFlagOffContract',
    'StaleFeatureFlagDropContract',
    'MobileStaleFeatureFlagDropContract',
    'editorMedia',
  ],
  parameters: {
    controls: {
      include: [
        'media',
        'mobileState',
        'selectedKey',
        'sensitiveMedia',
        'showImageEditPreview',
        'tool',
      ],
    },
    layout: 'centered',
  },
  title: 'KOSMO/Components/Composer Media Editor',
} satisfies Meta<typeof ComposerMediaEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

function NightshadeFlagScope({
  children,
  enabled,
}: PropsWithChildren<{ readonly enabled: boolean }>) {
  return (
    <FeatureFlagsContext.Provider value={(key) => key === 'post-composer-nightshade' && enabled}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

function NightshadeFlagToggleFixture({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(true);

  return (
    <NightshadeFlagScope enabled={enabled}>
      <Pressable
        accessibilityLabel={enabled ? 'Nightshade 플래그 끄기' : 'Nightshade 플래그 켜기'}
        accessibilityRole="button"
        onPress={() => setEnabled((current) => !current)}
      >
        <Text>{enabled ? 'Nightshade 플래그 끄기' : 'Nightshade 플래그 켜기'}</Text>
      </Pressable>
      {children}
    </NightshadeFlagScope>
  );
}

export const Playground: Story = {
  render: (args, context) => (
    <ViewportAwareEditor {...args} mobile={context.globals.viewport?.value === 'kosmoMobile'} />
  ),
};

export const Sensitive: Story = {
  args: { sensitiveMedia: true, tool: 'sensitive' },
  render: (args) => <WebEditorStory {...args} />,
};

export const CompactWebAlt: Story = {
  render: (args) => (
    <View style={{ height: 678, width: 720 }}>
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

export const MobileNightshade: Story = {
  args: {
    mobileState: 'nightshade',
    presentation: 'mobile',
    tool: 'nightshade',
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

  const editor = (
    <ComposerMediaEditor
      {...props}
      media={media}
      mobileState={mobileState}
      onAltTextChange={(key, altText) => {
        props.onAltTextChange(key, altText);
        setMedia((items) => items.map((item) => (item.key === key ? { ...item, altText } : item)));
      }}
      onApplyNightshadeChange={(key, value) => {
        props.onApplyNightshadeChange(key, value);
        setMedia((items) =>
          items.map((item) => (item.key === key ? { ...item, applyNightshade: value } : item)),
        );
      }}
      onSelectMedia={(key) => {
        props.onSelectMedia(key);
        setSelectedKey(key);
      }}
      onPreviewPress={
        props.presentation === 'mobile' && mobileState === 'altKeyboard'
          ? () => {
              setMobileState('default');
              props.onPreviewPress?.();
            }
          : undefined
      }
      onSensitiveMediaChange={(value) => {
        props.onSensitiveMediaChange(value);
        setSensitiveMedia(value);
      }}
      onToolChange={(value) => {
        props.onToolChange(value);
        setTool(value);
        if (props.presentation === 'mobile') {
          setMobileState((current) =>
            value === 'alt' && current === 'altKeyboard'
              ? 'default'
              : value === 'alt'
                ? 'altKeyboard'
                : value,
          );
        }
      }}
      selectedKey={selectedKey}
      sensitiveMedia={sensitiveMedia}
      tool={tool}
    />
  );

  return props.presentation === 'mobile' ? (
    <View
      style={{ height: '100dvh' as never, width: '100%' }}
      testID="composer-media-editor-story-surface"
    >
      {editor}
    </View>
  ) : (
    editor
  );
}

function WebEditorStory(props: ComposerMediaEditorProps) {
  return (
    <View style={{ height: 678, width: 920 }} testID="composer-media-editor-story-surface">
      <InteractiveEditor {...props} />
    </View>
  );
}

function ViewportAwareEditor({ mobile, ...props }: ComposerMediaEditorProps & { mobile: boolean }) {
  return mobile ? (
    <InteractiveEditor {...props} presentation="mobile" />
  ) : (
    <WebEditorStory {...props} presentation="web" />
  );
}

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onAltTextChange.mockClear();
    args.onApplyNightshadeChange.mockClear();
    args.onBack.mockClear();
    args.onClose.mockClear();
    args.onDone.mockClear();
    args.onSelectMedia.mockClear();
    args.onSensitiveMediaChange.mockClear();
    args.onToolChange.mockClear();
    const canvas = within(canvasElement);

    expect(canvas.getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '미디어 편집에서 뒤로' })).toHaveFocus(),
    );
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toHaveValue(
      '노을빛 밤하늘 아래 모인 사람들',
    );
    expect(canvas.getByText('1 / 2')).toBeVisible();
    expect(canvas.queryByRole('tab', { name: '이미지 편집 (준비 중)' })).toBeNull();
    expect(
      getComputedStyle(canvas.getByTestId('composer-media-editor-gallery')).borderTopWidth,
    ).toBe('0px');
    expect(
      getComputedStyle(canvas.getByTestId('composer-media-editor-footer')).borderTopWidth,
    ).toBe('0px');

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 선택' }));
    expect(args.onSelectMedia).toHaveBeenLastCalledWith('media-2');
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toHaveValue('');

    await userEvent.type(canvas.getByRole('textbox', { name: '이미지 설명' }), '두 번째 이미지');
    expect(args.onAltTextChange).toHaveBeenLastCalledWith('media-2', '두 번째 이미지');
    const altText = canvas.getByRole('textbox', { name: '이미지 설명' });
    const focusedAltText = getComputedStyle(altText);
    const altTextBorderWidth = focusedAltText.borderWidth;
    expect(altTextBorderWidth).toBe('1px');
    expect(focusedAltText.outlineWidth).toBe('0px');
    altText.blur();
    await waitFor(() => expect(altText).not.toHaveFocus());
    expect(getComputedStyle(altText).borderWidth).toBe(altTextBorderWidth);
    expect(getComputedStyle(altText).outlineWidth).toBe('0px');
    expect(altText).toHaveValue('두 번째 이미지');
    const sensitiveTab = canvas.getByRole('tab', { name: '민감도' });
    sensitiveTab.focus();
    expect(sensitiveTab).toHaveFocus();

    await userEvent.click(canvas.getByRole('tab', { name: '민감도' }));
    expect(args.onToolChange).toHaveBeenLastCalledWith('sensitive');
    await userEvent.click(canvas.getByRole('switch', { name: '민감한 이미지' }));
    expect(args.onSensitiveMediaChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(canvas.getByRole('tab', { name: 'AI 학습 방지 필터(베타)' }));
    expect(args.onToolChange).toHaveBeenLastCalledWith('nightshade');
    const secondImageNightshade = canvas.getByRole('switch', {
      name: '첨부 이미지 2 Nightshade 적용',
    });
    expect(secondImageNightshade).not.toBeChecked();
    await userEvent.click(secondImageNightshade);
    expect(args.onApplyNightshadeChange).toHaveBeenLastCalledWith('media-2', true);
    expect(secondImageNightshade).toBeChecked();

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 선택' }));
    expect(canvas.getByRole('switch', { name: '첨부 이미지 1 Nightshade 적용' })).not.toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 선택' }));
    expect(canvas.getByRole('switch', { name: '첨부 이미지 2 Nightshade 적용' })).toBeChecked();

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
    const surface = canvas.getByTestId('composer-media-editor-story-surface');
    const editor = canvas.getByTestId('mobile-composer-media-editor');
    expect(surface.getBoundingClientRect().width).toBe(390);
    expect(surface.getBoundingClientRect().height).toBe(844);
    expect(editor.getBoundingClientRect().width).toBe(390);
    expect(editor.getBoundingClientRect().height).toBe(844);
    expect(canvas.getByRole('button', { name: '미디어 편집에서 뒤로' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '완료' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '대체 텍스트 편집' })).toBeVisible();
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

export const MobileNightshadeGeometryContract: Story = {
  ...MobileNightshade,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('mobile-composer-media-editor-tool-sheet')).toHaveStyle({
      height: '184px',
    });
    expect(canvas.getByRole('switch', { name: '첨부 이미지 1 Nightshade 적용' })).not.toBeChecked();
  },
};

export const MobileToolInteractionContract: Story = {
  ...MobileDefault,
  play: async ({ args, canvasElement }) => {
    args.onPreviewPress?.mockClear();
    args.onApplyNightshadeChange.mockClear();
    args.onToolChange.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));

    expect(args.onToolChange).toHaveBeenLastCalledWith('alt');
    expect(canvas.getByRole('button', { name: '대체 텍스트 편집' })).toHaveTextContent('ALT');
    expect(canvas.getByTestId('mobile-composer-media-editor-tool-sheet')).toHaveStyle({
      height: '176px',
    });
    expect(canvas.getByTestId('mobile-composer-media-editor-keyboard')).toHaveStyle({
      height: '336px',
    });

    const altText = canvas.getByRole('textbox', { name: '이미지 설명' });
    await userEvent.clear(altText);
    await userEvent.type(altText, '작성한 설명');
    await userEvent.click(canvas.getByRole('button', { name: '선택한 첨부 이미지 1 미리보기' }));
    expect(args.onPreviewPress).toHaveBeenCalledOnce();
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));
    expect(canvas.getByTestId('mobile-composer-media-editor-keyboard')).toBeVisible();
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toHaveValue('작성한 설명');
    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));
    expect(canvas.queryByTestId('mobile-composer-media-editor-keyboard')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toHaveValue('작성한 설명');

    await userEvent.click(canvas.getByRole('button', { name: 'AI 학습 방지 필터(베타)' }));
    expect(args.onToolChange).toHaveBeenLastCalledWith('nightshade');
    const nightshadeSwitch = canvas.getByRole('switch', {
      name: '첨부 이미지 1 Nightshade 적용',
    });
    expect(nightshadeSwitch).not.toBeChecked();
    await userEvent.click(nightshadeSwitch);
    expect(args.onApplyNightshadeChange).toHaveBeenLastCalledWith('media-1', true);
    expect(nightshadeSwitch).toBeChecked();
  },
};

export const FeatureFlagOffContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.queryByRole('tab', { name: 'AI 학습 방지 필터(베타)' })).toBeNull();
    expect(canvas.queryByRole('switch', { name: '첨부 이미지 1 Nightshade 적용' })).toBeNull();
    expect(canvas.getByRole('tab', { name: '대체 텍스트' })).toBeVisible();
    expect(canvas.getByRole('tab', { name: '민감도' })).toBeVisible();

    await userEvent.click(canvas.getByRole('tab', { name: '민감도' }));
    const sensitiveMedia = canvas.getByRole('switch', { name: '민감한 이미지' });
    await userEvent.click(sensitiveMedia);
    expect(sensitiveMedia).toBeChecked();

    await userEvent.click(canvas.getByRole('tab', { name: '대체 텍스트' }));
    const altText = canvas.getByRole('textbox', { name: '이미지 설명' });
    await userEvent.type(altText, ' 추가 설명');
    expect(altText).toHaveValue('노을빛 밤하늘 아래 모인 사람들 추가 설명');
  },
  render: (args) => (
    <NightshadeFlagScope enabled={false}>
      <WebEditorStory {...args} />
    </NightshadeFlagScope>
  ),
};

export const MobileFeatureFlagOffContract: Story = {
  args: { mobileState: 'default', presentation: 'mobile', tool: 'alt' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.queryByRole('button', { name: 'AI 학습 방지 필터(베타)' })).toBeNull();
    expect(canvas.queryByTestId('mobile-composer-media-editor-tool-sheet')).toBeNull();
    expect(canvas.queryByRole('switch', { name: '첨부 이미지 1 Nightshade 적용' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '민감도 편집' }));
    const sensitiveMedia = canvas.getByRole('switch', { name: '민감한 이미지' });
    await userEvent.click(sensitiveMedia);
    expect(sensitiveMedia).toBeChecked();
  },
  render: (args) => (
    <NightshadeFlagScope enabled={false}>
      <InteractiveEditor {...args} />
    </NightshadeFlagScope>
  ),
};

export const StaleFeatureFlagDropContract: Story = {
  args: { selectedKey: 'media-2', tool: 'nightshade' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nightshadeSwitch = canvas.getByRole('switch', {
      name: '첨부 이미지 2 Nightshade 적용',
    });

    await userEvent.click(nightshadeSwitch);
    expect(nightshadeSwitch).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Nightshade 플래그 끄기' }));
    expect(canvas.queryByRole('tab', { name: 'AI 학습 방지 필터(베타)' })).toBeNull();
    expect(canvas.queryByRole('switch', { name: '첨부 이미지 2 Nightshade 적용' })).toBeNull();
    expect(canvas.getByRole('tab', { name: '대체 텍스트' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Nightshade 플래그 켜기' }));
    await userEvent.click(canvas.getByRole('tab', { name: 'AI 학습 방지 필터(베타)' }));
    expect(canvas.getByRole('switch', { name: '첨부 이미지 2 Nightshade 적용' })).toBeChecked();
  },
  render: (args) => (
    <NightshadeFlagToggleFixture>
      <WebEditorStory {...args} />
    </NightshadeFlagToggleFixture>
  ),
};

export const MobileStaleFeatureFlagDropContract: Story = {
  args: {
    mobileState: 'nightshade',
    presentation: 'mobile',
    selectedKey: 'media-2',
    tool: 'nightshade',
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nightshadeSwitch = canvas.getByRole('switch', {
      name: '첨부 이미지 2 Nightshade 적용',
    });

    await userEvent.click(nightshadeSwitch);
    expect(nightshadeSwitch).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Nightshade 플래그 끄기' }));
    expect(canvas.queryByRole('button', { name: 'AI 학습 방지 필터(베타)' })).toBeNull();
    expect(canvas.queryByRole('switch', { name: '첨부 이미지 2 Nightshade 적용' })).toBeNull();
    expect(canvas.queryByTestId('mobile-composer-media-editor-tool-sheet')).toBeNull();
    expect(canvas.getByRole('button', { name: '대체 텍스트 편집' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '민감도 편집' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '대체 텍스트 편집' }));
    expect(canvas.getByRole('textbox', { name: '이미지 설명' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Nightshade 플래그 켜기' }));
    await userEvent.click(canvas.getByRole('button', { name: 'AI 학습 방지 필터(베타)' }));
    expect(canvas.getByRole('switch', { name: '첨부 이미지 2 Nightshade 적용' })).toBeChecked();
  },
  render: (args) => (
    <NightshadeFlagToggleFixture>
      <InteractiveEditor {...args} />
    </NightshadeFlagToggleFixture>
  ),
};

export const WideImagePreviewContract: Story = {
  ...Playground,
  args: { mobileState: 'default', presentation: 'web' },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { layout: 'centered' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const preview = canvas.getAllByRole('img', { name: '선택한 첨부 이미지 1 미리보기' })[0];
    expect(preview.firstElementChild).toHaveStyle({ backgroundSize: 'contain' });
  },
};

export const PlaygroundMobileViewportContract: Story = {
  ...Playground,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('mobile-composer-media-editor')).toBeVisible();
    expect(canvas.queryByTestId('web-composer-media-editor')).toBeNull();
  },
};
