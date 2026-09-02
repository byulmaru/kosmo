import { expect, fn, userEvent, within } from 'storybook/test';
import { PostComposerMediaItemsTarget } from '@/components/post/PostComposerMediaItemsTarget';
import ogImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';

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
  parameters: { layout: 'padded' },
  title: 'KOSMO/Components/Post Composer Media Items',
} satisfies Meta<typeof PostComposerMediaItemsTarget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Uploading: Story = {
  args: { media: [mixedMedia[0]], sensitiveMedia: false },
};

export const Ready: Story = {
  args: { media: [mixedMedia[1], mixedMedia[3]] },
};

export const Failed: Story = {
  args: { media: [mixedMedia[2]], sensitiveMedia: false },
};

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onEdit.mockClear();
    args.onRemove.mockClear();
    args.onRetry.mockClear();
    const canvas = within(canvasElement);

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

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'alt');

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 2 ALT 편집' }));
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'alt');

    await userEvent.click(
      canvas.getByRole('button', { name: '첨부 이미지 2 민감한 이미지 설정 편집' }),
    );
    expect(args.onEdit).toHaveBeenLastCalledWith('ready-with-alt', 'sensitive');

    await userEvent.click(canvas.getByRole('button', { name: '3번째 이미지 업로드 다시 시도' }));
    expect(args.onRetry).toHaveBeenLastCalledWith(mixedMedia[2]);

    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 1 제거' }));
    expect(args.onRemove).toHaveBeenLastCalledWith('uploading');
  },
};
