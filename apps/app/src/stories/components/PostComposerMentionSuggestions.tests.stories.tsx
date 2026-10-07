import { Text } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostComposer } from '@/components/post/PostComposer';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: {
    author: <Text>테스트 작성자</Text>,
    authorProfileId: 'profile-author',
    body: '@alice',
    contentWarning: '',
    contentWarningExpanded: false,
    items: [],
    mentionCandidates: { authorProfileId: 'profile-author', profiles: [], query: 'alice' },
    mentionSearchState: 'loading',
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
    onRetryMentionSearch: fn(),
    onSelectionChange: fn(),
    onSubmit: fn(),
    onVisibilityChange: fn(),
    remaining: 494,
    selection: { end: 6, start: 6 },
    sensitiveMedia: false,
    surface: 'rail',
    visibility: 'PUBLIC',
  },
  component: PostComposer,
  parameters: { layout: 'padded' },
  title: 'KOSMO/Components/Post Composer Mention Suggestions/Tests',
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingAnnouncement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await userEvent.click(body);
    expect(body).toHaveFocus();
    expect(canvas.getByText('프로필을 검색하고 있어요.')).toHaveAttribute('aria-live', 'polite');
  },
};

export const FailureAnnouncementAndRetry: Story = {
  args: { mentionSearchState: 'error' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await userEvent.click(body);
    expect(body).toHaveFocus();

    const error = canvas.getByRole('alert');
    expect(error).toHaveTextContent('프로필을 검색하지 못했어요.');
    expect(error).toHaveAttribute('aria-live', 'polite');

    const retry = canvas.getByRole('button', { name: '다시 시도' });
    expect(retry.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    await userEvent.click(retry);
    expect(args.onRetryMentionSearch).toHaveBeenCalledWith();
  },
};
