import { useState } from 'react';
import { Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostComposer } from '@/components/post/PostComposer';
import baseMeta, {
  InteractionContract as interactionContract,
  mixedMedia,
} from './PostComposerMediaItems.stories';
import type { PostQuotePolicy } from '@kosmo/core/enums';
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
        onSelectionChange={fn()}
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
        selection={{ end: 0, start: 0 }}
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

export const QuotePolicyKeyboardContract: Story = {
  render: () => <QuotePolicyKeyboardFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 공개' }));

    const visibilityMenu = canvas.getByRole('menu', { name: '공개 범위 선택' });
    expect(within(visibilityMenu).getByRole('menuitem', { name: '인용 허용: 모두' })).toBeVisible();
    expect(canvas.queryByRole('group', { name: '인용 허용 정책' })).toBeNull();
    await userEvent.keyboard('{ArrowRight}');

    const quotePolicyGroup = within(visibilityMenu).getByRole('group', { name: '인용 허용 정책' });
    const policyOptions = within(quotePolicyGroup).getAllByRole('menuitemradio');
    expect(policyOptions[0]).toHaveFocus();
    expect(within(visibilityMenu).queryByRole('group', { name: '공개 범위' })).toBeNull();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(visibilityMenu).getByRole('menuitem', { name: '인용 허용: 모두' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');

    expect(canvas.getByRole('menuitemradio', { name: '내 팔로워' })).toHaveFocus();
    expect(canvas.getByRole('menuitemradio', { name: '내 팔로워' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(canvas.getByRole('button', { name: '공개 범위: 공개' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    const trigger = canvas.getByRole('button', { name: '공개 범위: 공개' });
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    expect(canvas.getByRole('menuitem', { name: '인용 허용: 내 팔로워' })).toBeVisible();
  },
};

function QuotePolicyKeyboardFixture() {
  const [quotePolicy, setQuotePolicy] = useState<PostQuotePolicy>('EVERYONE');
  return (
    <View style={{ width: 420 }}>
      <PostComposer
        author={<Text>테스트 작성자</Text>}
        body=""
        selection={{ start: 0, end: 0 }}
        onSelectionChange={fn()}
        contentWarning=""
        contentWarningExpanded={false}
        items={[]}
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
        onQuotePolicyChange={setQuotePolicy}
        onSubmit={fn()}
        onVisibilityChange={fn()}
        quotePolicy={quotePolicy}
        remaining={500}
        sensitiveMedia={false}
        surface="rail"
        visibility="PUBLIC"
      />
    </View>
  );
}
