import { usePathname } from 'expo-router';
import { Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostBody } from '@/components/post/PostBody';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostContentMentionStoryQuery } from './__generated__/PostContentMentionStoryQuery.graphql';

const sameLabelPostId = 'post-content-mention-story';
const firstProfileId = 'profile-content-mention-first';
const secondProfileId = 'profile-content-mention-second';
const missingProfileId = 'profile-content-mention-missing';
const longMentionLabel = '@this-is-a-deliberately-long-canonical-mention-label-for-reflow';

const PostContentMentionStoryQuery = graphql`
  query PostContentMentionStoryQuery {
    node(id: "post-content-mention-story") {
      __typename
      ... on Post {
        ...PostBody_post @alias(as: "body")
      }
    }
  }
`;

const sameLabelDocument = {
  version: 1,
  summary: null,
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { label: '@same', profileId: secondProfileId } },
          { type: 'text', text: ' ' },
          { type: 'mention', attrs: { label: '@same', profileId: firstProfileId } },
          { type: 'hard_break' },
          { type: 'mention', attrs: { label: '@same', profileId: secondProfileId } },
        ],
      },
    ],
  },
};

const sameLabelStoryData = {
  node: {
    __typename: 'Post',
    id: sameLabelPostId,
    content: {
      id: 'content-content-mention-story',
      bodyText: '@same @same @same',
      contentWarning: null,
      document: sameLabelDocument,
      media: [],
      // The relation order intentionally differs from the document occurrence order.
      mentionedProfiles: [
        {
          __typename: 'Profile',
          displayName: 'First Profile',
          id: firstProfileId,
          relativeHandle: '@first-profile',
        },
        {
          __typename: 'Profile',
          displayName: 'Second Profile',
          id: secondProfileId,
          relativeHandle: '@second-profile',
        },
      ],
    },
  },
};

const unavailableAndLongStoryData = {
  node: {
    __typename: 'Post',
    id: sameLabelPostId,
    content: {
      id: 'content-content-mention-unavailable-story',
      bodyText: `@gone ${longMentionLabel}`,
      contentWarning: null,
      document: {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'mention', attrs: { label: '@gone', profileId: missingProfileId } },
                { type: 'text', text: ' ' },
                {
                  type: 'mention',
                  attrs: { label: longMentionLabel, profileId: firstProfileId },
                },
              ],
            },
          ],
        },
      },
      media: [],
      mentionedProfiles: [
        {
          __typename: 'Profile',
          displayName: 'A profile with a deliberately long display name for reflow',
          id: firstProfileId,
          relativeHandle: '@a-profile-handle-that-is-long-enough-to-wrap',
        },
      ],
    },
  },
};

function PostContentMentionStory({ onBodyPress }: { onBodyPress?: () => void }) {
  const data = useLazyLoadQuery<PostContentMentionStoryQuery>(PostContentMentionStoryQuery, {});
  const pathname = usePathname();
  if (data.node?.__typename !== 'Post' || !data.node.body) {
    return <Text>Post Mention fixture를 불러오지 못했어요.</Text>;
  }

  return (
    <>
      <Text testID="post-content-mention-route">{pathname}</Text>
      <View style={{ width: 240 }}>
        <PostBody onBodyPress={onBodyPress} post={data.node.body} />
      </View>
    </>
  );
}

const meta = {
  args: { onBodyPress: fn() },
  component: PostContentMentionStory,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Post Content Mentions',
} satisfies Meta<typeof PostContentMentionStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SameLabelTargetsLight: Story = {
  globals: { theme: 'light' },
  parameters: { relay: { data: sameLabelStoryData } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const route = canvas.getByTestId('post-content-mention-route');
    const links = canvas.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(route).toHaveTextContent('/home');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/@second-profile',
      '/@first-profile',
      '/@second-profile',
    ]);
    expect(links[0]).toHaveAccessibleName('@same, Second Profile, @second-profile 프로필 보기');
    expect(links[1]).toHaveAccessibleName('@same, First Profile, @first-profile 프로필 보기');

    await userEvent.click(links[0]);
    expect(route).toHaveTextContent('/@second-profile');
    expect(args.onBodyPress).not.toHaveBeenCalled();
  },
};

export const SameLabelTargetsDark: Story = {
  globals: { theme: 'dark' },
  parameters: { relay: { data: sameLabelStoryData } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const route = canvas.getByTestId('post-content-mention-route');
    const links = canvas.getAllByRole('link');
    expect(links).toHaveLength(3);
    links[1]?.focus();
    await userEvent.keyboard('{Enter}');
    expect(route).toHaveTextContent('/@first-profile');
    expect(args.onBodyPress).not.toHaveBeenCalled();
    expect(links[1]).toHaveAttribute('href', '/@first-profile');
  },
};

export const UnavailableAndLongProfileFallback: Story = {
  parameters: { relay: { data: unavailableAndLongStoryData } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('@gone', { exact: true })).toBeVisible();
    const links = canvas.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(canvas.getByText('@gone', { exact: true }).closest('a')).toBeNull();
    expect(
      canvas.getByRole('link', {
        name: `${longMentionLabel}, A profile with a deliberately long display name for reflow, @a-profile-handle-that-is-long-enough-to-wrap 프로필 보기`,
      }),
    ).toBeVisible();
    expect(canvas.getByText(longMentionLabel, { exact: true })).toBeVisible();
  },
};
