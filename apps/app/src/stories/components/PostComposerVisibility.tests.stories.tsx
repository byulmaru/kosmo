import { useState } from 'react';
import { Text } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostComposer } from '@/components/post/PostComposer';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: {
    author: <Text>테스트 작성자</Text>,
    body: '',
    contentWarning: '',
    contentWarningExpanded: false,
    items: [],
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
    onSelectionChange: fn(),
    onSubmit: fn(),
    onVisibilityChange: fn(),
    remaining: 500,
    selection: { end: 0, start: 0 },
    sensitiveMedia: false,
    surface: 'rail',
    visibility: 'UNLISTED',
  },
  component: PostComposer,
  parameters: { layout: 'padded' },
  title: 'KOSMO/Components/Post Composer Visibility/Tests',
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DirectSelection: Story = {
  render: (args) => {
    const [visibility, setVisibility] = useState(args.visibility);
    return (
      <PostComposer
        {...args}
        onVisibilityChange={(value) => {
          args.onVisibilityChange(value);
          setVisibility(value);
        }}
        visibility={visibility}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }));

    const directOption = canvas.getByRole('menuitemradio', { name: '지정 멤버만' });
    expect(
      within(directOption).getByText(
        '본문에 멘션한 계정만 볼 수 있어요. 한 명 이상 멘션해 주세요.',
      ),
    ).toBeVisible();
    await userEvent.click(directOption);

    expect(args.onVisibilityChange).toHaveBeenLastCalledWith('DIRECT');
    expect(canvas.getByRole('button', { name: '공개 범위: 지정 멤버만' })).toBeVisible();
  },
};
