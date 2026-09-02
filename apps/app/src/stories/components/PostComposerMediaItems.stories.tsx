import { useEffect, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ComposerMediaEditor } from '@/components/post/ComposerMediaEditor';
import { PostComposerMediaItemsTarget } from '@/components/post/PostComposerMediaItemsTarget';
import ogImage from '../../../public/og-default.png?url';
import { ComposerOverlayFixture } from '../fixtures/ComposerOverlayFixture';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';
import type { PostComposerMediaItemsTargetProps } from '@/components/post/PostComposerMediaItemsTarget';

const mediaAsset = { height: 156, uri: ogImage, width: 156 };

export const mixedMedia: readonly ComposerMediaItem[] = [
  { altText: '', asset: mediaAsset, key: 'uploading', state: 'uploading' },
  {
    altText: '밤하늘 아래 모인 사람들',
    asset: mediaAsset,
    key: 'ready-with-alt',
    mediaId: 'media-ready-with-alt',
    state: 'ready',
  },
  {
    altText: '',
    asset: mediaAsset,
    failure: { reason: 'transient', stage: 'transfer' },
    key: 'failed',
    state: 'failed',
  },
  {
    altText: '',
    asset: mediaAsset,
    key: 'ready-without-alt',
    mediaId: 'media-ready-without-alt',
    state: 'ready',
  },
];

const meta = {
  args: {
    disabled: false,
    media: mixedMedia,
    onEdit: fn(),
    onRemove: fn(),
    onRetry: fn(),
    sensitiveMedia: true,
  },
  argTypes: {
    disabled: { control: 'boolean' },
    media: { control: 'object' },
    onEdit: { action: 'edit', control: false },
    onRemove: { action: 'remove', control: false },
    onRetry: { action: 'retry', control: false },
    sensitiveMedia: { control: 'boolean' },
  },
  component: PostComposerMediaItemsTarget,
  excludeStories: ['InteractionContract', 'mixedMedia'],
  parameters: {
    controls: { exclude: ['onEdit', 'onRemove', 'onRetry'] },
    layout: 'padded',
  },
  title: 'KOSMO/Components/Post Composer Media Items',
} satisfies Meta<typeof PostComposerMediaItemsTarget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <InteractiveMediaItems {...args} />,
};

export const Uploading: Story = {
  args: { media: [mixedMedia[0]], sensitiveMedia: false },
};

export const Ready: Story = {
  args: { media: [mixedMedia[1], mixedMedia[3]] },
};

export const Failed: Story = {
  args: { media: [mixedMedia[2]], sensitiveMedia: false },
};

function InteractiveMediaItems(props: PostComposerMediaItemsTargetProps) {
  const [media, setMedia] = useState(props.media);
  const [sensitiveMedia, setSensitiveMedia] = useState(props.sensitiveMedia);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(props.media[0]?.key ?? '');
  const [tool, setTool] = useState<'alt' | 'sensitive'>('alt');

  useEffect(() => setMedia(props.media), [props.media]);
  useEffect(() => setSensitiveMedia(props.sensitiveMedia), [props.sensitiveMedia]);

  return (
    <>
      <PostComposerMediaItemsTarget
        {...props}
        media={media}
        onEdit={(key, nextTool) => {
          props.onEdit(key, nextTool);
          setEditorOpen(true);
          setSelectedKey(key);
          setTool(nextTool);
        }}
        onRemove={(key) => {
          props.onRemove(key);
          setMedia((current) => current.filter((item) => item.key !== key));
        }}
        onRetry={props.onRetry}
        sensitiveMedia={sensitiveMedia}
      />
      <ComposerOverlayFixture
        accessibilityLabel="미디어 편집"
        maxWidth={920}
        onRequestClose={() => setEditorOpen(false)}
        visible={editorOpen}
      >
        {editorOpen ? (
          <ComposerMediaEditor
            media={media.filter((item) => item.state === 'ready')}
            onAltTextChange={(key, altText) => {
              setMedia((current) =>
                current.map((item) => (item.key === key ? { ...item, altText } : item)),
              );
            }}
            onBack={() => setEditorOpen(false)}
            onClose={() => setEditorOpen(false)}
            onDone={() => setEditorOpen(false)}
            onSelectMedia={(key) => setSelectedKey(key)}
            onSensitiveMediaChange={setSensitiveMedia}
            onToolChange={setTool}
            presentation="web"
            selectedKey={selectedKey}
            sensitiveMedia={sensitiveMedia}
            showImageEditPreview={false}
            tool={tool}
          />
        ) : null}
      </ComposerOverlayFixture>
    </>
  );
}

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onEdit.mockClear();
    args.onRemove.mockClear();
    args.onRetry.mockClear();
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    expect(canvas.getByLabelText('첨부 이미지 1, 업로드 중')).toHaveStyle({
      height: '156px',
      width: '156px',
    });
    expect(canvas.getByLabelText('첨부 이미지 2, 업로드 완료')).toBeVisible();
    expect(canvas.getByLabelText('첨부 이미지 3, 업로드 실패')).toBeVisible();
    expect(canvas.getByText('업로드 실패')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 2 ALT 편집' })).toBeVisible();
    expect(canvas.getAllByRole('button', { name: /민감한 이미지 설정 편집/ })).toHaveLength(2);

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 대체 텍스트 편집' }));
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'alt');
    let dialog = page.getByRole('dialog', { name: '미디어 편집' });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(within(dialog).getByRole('textbox', { name: '이미지 설명' })).toHaveValue(
      '밤하늘 아래 모인 사람들',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: '이미지 설명' }), ' 추가');
    await userEvent.click(within(dialog).getByRole('button', { name: '완료' }));
    expect(page.queryByRole('dialog', { name: '미디어 편집' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'alt');
    dialog = page.getByRole('dialog', { name: '미디어 편집' });
    expect(within(dialog).getByRole('textbox', { name: '이미지 설명' })).toHaveValue(
      '밤하늘 아래 모인 사람들 추가',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: '미디어 편집에서 뒤로' }));
    expect(page.queryByRole('dialog', { name: '미디어 편집' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 ALT 편집' }));
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'alt');
    dialog = page.getByRole('dialog', { name: '미디어 편집' });
    await userEvent.click(within(dialog).getByRole('button', { name: '미디어 편집 닫기' }));
    expect(page.queryByRole('dialog', { name: '미디어 편집' })).toBeNull();

    await userEvent.click(
      canvas.getByRole('button', { name: '첨부 이미지 2 민감한 이미지 설정 편집' }),
    );
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'sensitive');
    dialog = page.getByRole('dialog', { name: '미디어 편집' });
    expect(within(dialog).getByRole('switch', { name: '민감한 이미지' })).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '완료' }));
    expect(page.queryByRole('dialog', { name: '미디어 편집' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '3번째 이미지 업로드 다시 시도' }));
    expect(args.onRetry).toHaveBeenLastCalledWith(mixedMedia[2]);

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 제거' }));
    expect(args.onRemove).toHaveBeenLastCalledWith('uploading');
  },
  render: (args) => <InteractiveMediaItems {...args} />,
};
