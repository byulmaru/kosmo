import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostLayout } from '@/components/post/PostLayout';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostMuteStoryQuery } from './__generated__/PostMuteStoryQuery.graphql';

const author = profile({
  id: 'mute-author',
  displayName: '코스모 작가',
  relativeHandle: '@kosmo',
  viewerState: { follow: null, followRequest: null, isSelf: false, profileMute: null },
});
const storyPost = post({
  id: 'mute-post',
  profile: author,
  bodyText: '오늘 발견한 작은 별의 이야기를 나눠요.',
});
const query = graphql`
  query PostMuteStoryQuery($id: ID!) {
    node(id: $id) {
      ... on Post {
        ...PostLayout_post @alias(as: "layout")
      }
    }
  }
`;
function Fixture() {
  const data = useLazyLoadQuery<PostMuteStoryQuery>(query, { id: storyPost.id });
  return (
    <View style={{ width: '100%', maxWidth: 600 }}>
      {data.node?.layout ? <PostLayout post={data.node.layout} /> : null}
    </View>
  );
}
const meta = {
  component: Fixture,
  decorators: [
    (Story) => (
      <SessionProvider>
        <PostActionAuthenticationProvider>
          <PostReplyCoordinatorProvider owner="detail" profile={null}>
            <PostMediaViewerHostProvider>
              <Story />
            </PostMediaViewerHostProvider>
          </PostReplyCoordinatorProvider>
        </PostActionAuthenticationProvider>
      </SessionProvider>
    ),
  ],
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'mute-session', selectedProfile: { id: 'mute-viewer' } },
        me: { id: 'mute-account', name: '스토리 계정' },
        node: { ...storyPost, viewerReactions: [] },
      },
    },
    router: {
      pathname: '/@kosmo/mute-post',
      segments: ['(tabs)', '(post)', '[profileHandle]', '[postId]'],
    },
  },
  title: 'KOSMO/Patterns/Post/Mute',
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Muted: Story = {
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'mute-session', selectedProfile: { id: 'mute-viewer' } },
        me: { id: 'mute-account', name: '스토리 계정' },
        node: {
          ...storyPost,
          profile: {
            ...author,
            viewerState: {
              follow: null,
              followRequest: null,
              isSelf: false,
              profileMute: { id: 'profile-mute:story' },
            },
          },
          viewerReactions: [],
        },
      },
    },
  },
};
export const Mobile: Story = { globals: { viewport: { value: 'kosmoMobile', isRotated: false } } };
