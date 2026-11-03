import { usePathname, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostBody } from '@/components/post/PostBody';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostContentHashtagStoryQuery } from './__generated__/PostContentHashtagStoryQuery.graphql';

const hashtagGlobalId = 'SGFzaHRhZzox';
const postId = 'post-content-hashtag-story';
const PostContentHashtagStoryQuery = graphql`
  query PostContentHashtagStoryQuery {
    node(id: "post-content-hashtag-story") {
      __typename
      ... on Post {
        ...PostBody_post @alias(as: "body")
      }
    }
  }
`;

const hashtagDocument = {
  version: 1,
  summary: null,
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Topic ' },
          { type: 'hashtag', attrs: { hashtagId: hashtagGlobalId, token: '#MiXeD' } },
          { type: 'text', text: ' and ' },
          { type: 'hashtag', attrs: { hashtagId: hashtagGlobalId, token: '#mixed' } },
        ],
      },
    ],
  },
};

const hashtagStoryData = {
  node: {
    __typename: 'Post',
    id: postId,
    content: {
      id: 'content-content-hashtag-story',
      bodyText: 'Topic #MiXeD and #mixed',
      contentWarning: null,
      document: hashtagDocument,
      media: [],
      mentionedProfiles: [],
    },
  },
};

function PostContentHashtagStory({ onBodyPress }: { onBodyPress?: () => void }) {
  const data = useLazyLoadQuery<PostContentHashtagStoryQuery>(PostContentHashtagStoryQuery, {});
  const pathname = usePathname();
  const router = useRouter();
  if (data.node?.__typename !== 'Post' || !data.node.body) {
    return <Text>Post Hashtag fixture를 불러오지 못했어요.</Text>;
  }

  return (
    <>
      <Text testID="post-content-hashtag-route">{pathname}</Text>
      <View style={{ width: 320 }}>
        <PostBody
          onBodyPress={() => {
            onBodyPress?.();
            router.push('/@author/post-content-hashtag-story');
          }}
          post={data.node.body}
        />
      </View>
    </>
  );
}

const meta = {
  args: { onBodyPress: fn() },
  component: PostContentHashtagStory,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Post Content Hashtags',
} satisfies Meta<typeof PostContentHashtagStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RepeatedTargets: Story = {
  name: 'Tests / Repeated Targets',
  parameters: { relay: { data: hashtagStoryData } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const route = canvas.getByTestId('post-content-hashtag-route');
    const links = canvas.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/hashtags/[hashtagId]/posts',
      '/hashtags/[hashtagId]/posts',
    ]);
    expect(links[0]).toHaveAccessibleName('#MiXeD, 게시글 보기');
    expect(links[1]).toHaveAccessibleName('#mixed, 게시글 보기');
    expect(route).toHaveTextContent('/home');

    await userEvent.click(links[0]!);
    expect(route).toHaveTextContent('/hashtags/[hashtagId]/posts');
    expect(args.onBodyPress).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByTestId('post-list-row-body'));
    expect(route).toHaveTextContent('/@author/post-content-hashtag-story');
    expect(args.onBodyPress).toHaveBeenCalledTimes(1);
  },
};
