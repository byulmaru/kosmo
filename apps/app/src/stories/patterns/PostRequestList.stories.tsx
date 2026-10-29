import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PostRequestList } from '@/components/post/PostRequestList';
import { profile } from '../fixtures';
import { Catalog } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostRequestListStoriesQuery as Query } from './__generated__/PostRequestListStoriesQuery.graphql';

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
  draft: {
    __typename: 'PostRequestDraft' as const,
    bodyText: '게시 요청의 본문을 확인할 수 있어요.',
    contentWarning: null,
    media: [],
    sensitiveMedia: false,
  },
  id: 'post-request-list-node-failed',
  post: null,
  requestId: 'post-request-list-failed',
  status: 'FAILED' as const,
};

function account(requests: ReadonlyArray<typeof failedRequest>) {
  return {
    __typename: 'Account' as const,
    id: 'post-request-list-account',
    postRequests: {
      __typename: 'PostRequestConnection' as const,
      edges: requests.map((node, index) => ({
        __typename: 'PostRequestConnectionEdge' as const,
        cursor: 'post-request-list-cursor-' + index,
        node,
      })),
      pageInfo: {
        __typename: 'PageInfo' as const,
        endCursor: requests.length ? 'post-request-list-cursor-' + (requests.length - 1) : null,
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: requests.length ? 'post-request-list-cursor-0' : null,
      },
    },
  };
}

const PostRequestListStoriesQuery = graphql`
  query PostRequestListStoriesQuery($profileId: ID!) {
    me {
      id
      ...PostRequestList_account @arguments(profileId: $profileId)
    }
  }
`;

function PostRequestListFixture({ onRewrite }: { onRewrite: (requestId: string) => void }) {
  const data = useLazyLoadQuery<Query>(PostRequestListStoriesQuery, { profileId });
  if (!data.me) {
    throw new Error('PostRequestListStoriesQuery must return the account fixture.');
  }

  return (
    <Catalog>
      <PostRequestList account={data.me} onRewrite={onRewrite} profileId={profileId} />
    </Catalog>
  );
}

const meta = {
  args: { onRewrite: fn() },
  argTypes: {
    onRewrite: { action: 'rewrite', control: false },
  },
  component: PostRequestListFixture,
  parameters: {
    layout: 'padded',
    relay: { data: { me: account([failedRequest]) } },
  },
  title: 'KOSMO/Patterns/PostRequestList',
} satisfies Meta<typeof PostRequestListFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Empty: Story = {
  parameters: { relay: { data: { me: account([]) } } },
};
