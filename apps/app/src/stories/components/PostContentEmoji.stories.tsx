import { Text, View } from 'react-native';
import { PostContentEmoji } from '@/components/post/PostContentEmoji';
import type { Meta, StoryObj } from '@storybook/react-vite';

const localEmojiImage = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#FFE597"/><circle cx="11" cy="13" r="2" fill="#1A1A1A"/><circle cx="21" cy="13" r="2" fill="#1A1A1A"/><path d="M10 20c3 3 9 3 12 0" fill="none" stroke="#1A1A1A" stroke-width="2"/></svg>',
)}`;

function PostContentEmojiStory({ shortcode, url }: { shortcode: string; url: string }) {
  return (
    <View style={{ maxWidth: 360 }}>
      <Text style={{ fontSize: 20, lineHeight: 30 }}>
        원격 본문 <PostContentEmoji fontSize={20} shortcode={shortcode} url={url} /> 를 본문 흐름
        안에서 표시합니다.
      </Text>
    </View>
  );
}

const meta = {
  args: { shortcode: ':blobcat:', url: localEmojiImage },
  component: PostContentEmojiStory,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Post Content Emoji',
} satisfies Meta<typeof PostContentEmojiStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LocalFixture: Story = {
  name: 'Local Fixture',
};

export const FailedFixture: Story = {
  args: { shortcode: ':unavailable:', url: 'data:image/png;base64,not-valid' },
  name: 'Failed Fixture',
};
