import { fn } from 'storybook/test';
import { PostRequestListSummary } from '@/components/post/PostRequestList';
import { profile } from '../fixtures';
import { Catalog } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const profileId = 'post-request-list-profile';
const authorProfile = profile({
  displayName: '코스모 작가',
  handle: 'kosmo',
  id: profileId,
  relativeHandle: '@kosmo',
});
const failedRequest = {
  __typename: 'PostRequest' as const,
  authorProfile,
  bodyText: '게시 요청의 본문을 확인할 수 있어요.',
  contentWarning: null,
  id: 'post-request-list-node-failed',
  media: [],
  post: null,
  requestId: 'post-request-list-failed',
  status: 'FAILED' as const,
  sensitiveMedia: false,
};
const queuedRequest = {
  ...failedRequest,
  bodyText: '처리 중인 게시 요청입니다.',
  id: 'post-request-list-node-queued',
  requestId: 'post-request-list-queued',
  status: 'QUEUED' as const,
};

function PostRequestListFixture({ onCompose }: { onCompose: () => void }) {
  return (
    <Catalog>
      <PostRequestListSummary onCompose={onCompose} profileId={profileId} />
    </Catalog>
  );
}

const meta = {
  args: { onCompose: fn() },
  argTypes: {
    onCompose: { action: 'compose', control: false },
  },
  component: PostRequestListFixture,
  parameters: {
    layout: 'padded',
    relay: {
      data: {
        node: {
          __typename: 'Profile',
          id: profileId,
          postRequests: [failedRequest, queuedRequest],
        },
      },
    },
  },
  title: 'KOSMO/Patterns/PostRequestList',
} satisfies Meta<typeof PostRequestListFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Empty: Story = {
  parameters: {
    relay: {
      data: {
        node: {
          __typename: 'Profile',
          id: profileId,
          postRequests: [],
        },
      },
    },
  },
};
