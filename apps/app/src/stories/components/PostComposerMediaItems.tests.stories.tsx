import { Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostComposer } from '@/components/post/PostComposer';
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

export const HorizontalReachabilityContract: Story = {
  render: () => (
    <View style={{ width: 320 }}>
      <PostComposer
        author={<Text>테스트 작성자</Text>}
        body=""
        contentWarning=""
        contentWarningExpanded={false}
        items={mixedMedia}
        onBodyChange={fn()}
        onContentWarningChange={fn()}
        onContentWarningToggle={fn()}
        onEmojiAction={fn()}
        onExpand={fn()}
        onMediaAction={fn()}
        onMediaEdit={fn()}
        onMediaRemove={fn()}
        onMediaRetry={fn()}
        onPollAction={fn()}
        onSubmit={fn()}
        onVisibilityChange={fn()}
        remaining={500}
        sensitiveMedia
        surface="rail"
        visibility="PUBLIC"
      />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gallery = canvas.getByLabelText('첨부 이미지 갤러리, 4개');
    expect(canvas.queryByRole('alert')).toBeNull();
    expect(canvas.getByLabelText('첨부 이미지 3, 업로드 실패')).toBeVisible();
    expect(canvas.getByRole('button', { name: '3번째 이미지 업로드 다시 시도' })).toBeVisible();
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
