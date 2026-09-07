import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostLayout } from '@/components/post/PostLayout';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { StateView } from '@/components/ui/StateView';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfileMuteFeedback } from '@/components/profile/ProfileMuteAction';
import type { PostBlockStoryQuery } from './__generated__/PostBlockStoryQuery.graphql';

const author = profile({
  id: 'block-author',
  displayName: '코스모 작가',
  relativeHandle: '@kosmo',
});
const storyPost = post({
  bodyText: '오늘 발견한 작은 별의 이야기를 나눠요.',
  id: 'block-post',
  profile: author,
});
const query = graphql`
  query PostBlockStoryQuery($id: ID!) {
    node(id: $id) {
      ... on Post {
        ...PostLayout_post @alias(as: "layout")
      }
    }
  }
`;

type BlockFeedback = { blocked: boolean; status: 'success' | 'error' };
type Props = {
  blockProfileId?: string;
  muted: boolean;
  onBlock: () => Promise<void>;
  onBlockFeedback: (feedback: BlockFeedback) => void;
  onBlockDismiss: () => void;
  onMute: () => Promise<void>;
  onMuteFeedback: (feedback: ProfileMuteFeedback) => void;
  onUnmute: () => Promise<void>;
  outcome: 'success' | 'error' | 'pending';
};

function Fixture({
  blockProfileId = author.id,
  muted: initialMuted,
  onBlock,
  onBlockFeedback,
  onBlockDismiss,
  onMute,
  onMuteFeedback,
  onUnmute,
  outcome,
}: Props) {
  const [blocked, setBlocked] = useState(false);
  const blockedSurfaceRef = useRef<View>(null);
  useEffect(() => {
    if (blocked) {
      blockedSurfaceRef.current?.focus();
    }
  }, [blocked]);
  const [muted, setMuted] = useState(initialMuted);
  useEffect(() => {
    setBlocked(false);
    setMuted(initialMuted);
  }, [initialMuted, outcome]);
  const data = useLazyLoadQuery<PostBlockStoryQuery>(query, { id: storyPost.id });
  const layout = data.node?.layout;

  return (
    <View style={{ width: '100%', maxWidth: 600 }}>
      {blocked ? (
        <View
          ref={blockedSurfaceRef}
          {...(Platform.OS === 'web' ? { tabIndex: -1 as const } : { focusable: true })}
          testID="post-blocked-surface"
        >
          <StateView title="게시물을 볼 수 없습니다" />
        </View>
      ) : layout ? (
        <PostLayout
          block={{
            onDismiss: onBlockDismiss,
            onBlock: async () => {
              await onBlock();
              if (outcome === 'pending') {
                await new Promise<void>(() => {});
              }
              if (outcome === 'error') {
                throw new Error('요청 실패');
              }
            },
            onFeedback: (feedback) => {
              onBlockFeedback(feedback);
              if (feedback.status === 'success' && feedback.blocked) {
                setBlocked(true);
              }
            },
            profileId: blockProfileId,
          }}
          mute={{
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
              onMuteFeedback(feedback);
              if (feedback.status === 'success') {
                setMuted(feedback.muted);
              }
            },
            profileId: author.id,
          }}
          post={layout}
        />
      ) : null}
    </View>
  );
}

const relayData = {
  currentSession: { id: 'block-session', selectedProfile: { id: 'block-viewer' } },
  me: { id: 'block-account', name: '스토리 계정' },
  node: { ...storyPost, viewerReactions: [] },
};

const meta = {
  args: {
    muted: false,
    onBlock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onBlockFeedback: fn(),
    onBlockDismiss: fn(),
    onMute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onMuteFeedback: fn(),
    onUnmute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
  },
  argTypes: {
    muted: { control: 'boolean' },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
  },
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
    controls: { include: ['muted', 'outcome'] },
    relay: { data: relayData },
    router: {
      pathname: '/@kosmo/block-post',
      segments: ['(tabs)', '(post)', '[profileHandle]', '[postId]'],
    },
  },
  title: 'KOSMO/Patterns/Post/Block',
} satisfies Meta<typeof Fixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Muted: Story = { args: { muted: true } };
export const Mobile: Story = { globals: { viewport: { value: 'kosmoMobile', isRotated: false } } };
export const SelfAuthor: Story = {
  parameters: {
    relay: {
      data: {
        ...relayData,
        currentSession: { id: 'block-self-session', selectedProfile: { id: author.id } },
      },
    },
  },
};
