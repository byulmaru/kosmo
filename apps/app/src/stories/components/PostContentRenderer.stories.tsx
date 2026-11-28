import { expect, within } from 'storybook/test';
import { PostContentRenderer } from '@/components/post/PostContentRenderer';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: PostContentRenderer,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Post Content Renderer',
} satisfies Meta<typeof PostContentRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContentWarningHidden: Story = {
  args: {
    bodyText: ':blobcat:',
    contentWarning: '민감한 내용',
    document: {
      version: 1,
      summary: '민감한 내용',
      body: {
        type: 'doc',
        attrs: {
          customEmojis: [{ shortcode: ':blobcat:', url: 'https://emoji.example/blobcat.png' }],
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: ':blobcat:' }],
          },
        ],
      },
    },
    media: [],
    mentionedProfiles: [],
    postId: 'post-content-emoji-warning-story',
  },
  name: 'Content Warning Hidden',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('button', { name: '민감한 내용, 본문, 보기' })).toBeVisible();
    expect(canvas.queryByText(':blobcat:', { exact: true })).toBeNull();
    expect(canvas.queryByRole('img')).toBeNull();
  },
};
