import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostLayout } from '@/components/post/PostLayout';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfileMuteFeedback } from '@/components/profile/ProfileMuteAction';
import type { PostMuteStoryQuery } from './__generated__/PostMuteStoryQuery.graphql';

const author = profile({ id: 'mute-author', displayName: '코스모 작가', relativeHandle: '@kosmo' });
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
type Props = {
  muted: boolean;
  outcome: 'success' | 'error' | 'pending';
  onMute: () => Promise<void>;
  onUnmute: () => Promise<void>;
  onFeedback: (feedback: ProfileMuteFeedback) => void;
};
function Fixture({ muted: initialMuted, outcome, onMute, onUnmute, onFeedback }: Props) {
  const [muted, setMuted] = useState(initialMuted);
  useEffect(() => setMuted(initialMuted), [initialMuted]);
  const data = useLazyLoadQuery<PostMuteStoryQuery>(query, { id: storyPost.id });
  return (
    <View style={{ width: '100%', maxWidth: 600 }}>
      {data.node?.layout ? (
        <PostLayout
          post={data.node.layout}
          mute={{
            profileId: author.id,
            muted,
            onChangeMuted: async (nextMuted) => {
              await (nextMuted ? onMute() : onUnmute());
              if (outcome === 'pending') {
                await new Promise<void>(() => {});
              }
              if (outcome === 'error') {
                throw new Error('요청 실패');
              }
            },
            onFeedback: (feedback) => {
              onFeedback(feedback);
              if (feedback.status === 'success') {
                setMuted(feedback.muted);
              }
            },
          }}
        />
      ) : null}
    </View>
  );
}
const meta = {
  component: Fixture,
  args: {
    muted: false,
    outcome: 'success',
    onMute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onUnmute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onFeedback: fn(),
  },
  argTypes: {
    muted: { control: 'boolean' },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
  },
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
    controls: { include: ['muted', 'outcome'] },
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
export const Muted: Story = { args: { muted: true } };
export const Mobile: Story = { globals: { viewport: { value: 'kosmoMobile', isRotated: false } } };
