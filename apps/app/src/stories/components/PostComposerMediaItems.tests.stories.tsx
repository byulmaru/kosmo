import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostComposerMediaItemsTarget } from '@/components/post/PostComposerMediaItemsTarget';
import baseMeta, {
  InteractionContract as interactionContract,
  mixedMedia,
} from './PostComposerMediaItems.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Post Composer Media Items/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;

export const ControlsContract: Story = {
  play: async () => {
    const controls = baseMeta.parameters?.controls;

    expect(controls?.exclude).toEqual(['onEdit', 'onRemove', 'onRetry']);
    expect(baseMeta.argTypes?.onEdit?.action).toBe('edit');
    expect(baseMeta.argTypes?.onRemove?.action).toBe('remove');
    expect(baseMeta.argTypes?.onRetry?.action).toBe('retry');
  },
};

export const HorizontalReachabilityContract: Story = {
  render: () => (
    <View style={{ width: 320 }}>
      <PostComposerMediaItemsTarget
        disabled={false}
        media={mixedMedia}
        onEdit={fn()}
        onRemove={fn()}
        onRetry={fn()}
        sensitiveMedia
      />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const gallery = within(canvasElement).getByLabelText('첨부 이미지 갤러리, 4개');
    const firstAction = within(gallery).getByRole('button', { name: '첨부 이미지 1 제거' });
    const laterItemAction = within(gallery).getByRole('button', {
      name: '첨부 이미지 4 편집',
    });
    const previousButton = within(canvasElement).getByRole('button', {
      name: '첨부 이미지 갤러리 이전',
    });
    const nextButton = within(canvasElement).getByRole('button', {
      name: '첨부 이미지 갤러리 다음',
    });

    expect(getComputedStyle(gallery).scrollbarWidth).toBe('none');
    expect(gallery.scrollWidth).toBeGreaterThan(gallery.clientWidth);
    expect(previousButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();
    const initialArrowScrollLeft = gallery.scrollLeft;
    await userEvent.click(nextButton);
    expect(gallery.scrollLeft).toBeGreaterThan(initialArrowScrollLeft);
    expect(previousButton).not.toBeDisabled();
    for (let index = 0; index < 8 && !nextButton.hasAttribute('disabled'); index += 1) {
      await userEvent.click(nextButton);
    }
    expect(nextButton).toBeDisabled();
    await userEvent.click(firstAction);
    const initialScrollLeft = gallery.scrollLeft;
    for (let index = 0; index < 12 && document.activeElement !== laterItemAction; index += 1) {
      await userEvent.tab();
    }
    expect(laterItemAction).toHaveFocus();
    expect(gallery.scrollLeft).toBeGreaterThan(initialScrollLeft);
  },
};
