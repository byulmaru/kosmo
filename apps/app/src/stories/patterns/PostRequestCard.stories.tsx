import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PostRequestCard } from '@/components/post/PostRequestCard';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import { post, profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostRequestCardStoriesQuery as Query } from './__generated__/PostRequestCardStoriesQuery.graphql';

const author = profile({
  avatar: {
    id: 'post-request-card-author-avatar',
    url: appleTouchIconUrl,
  },
  displayName: '별빛 여행자',
  id: 'post-request-card-author',
  relativeHandle: '@starlight',
});
const mediaUrl =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8b7dea"/></svg>',
  );
const media = {
  __typename: 'Media' as const,
  altText: '보라색 하늘',
  id: 'post-request-card-media',
  url: mediaUrl,
};

function request({
  id,
  status,
  bodyText,
  contentWarning = null,
  sensitiveMedia = false,
  publishedPost = null,
}: {
  id: string;
  status: 'PROCESSING' | 'FAILED' | 'PUBLISHED';
  bodyText: string;
  contentWarning?: string | null;
  sensitiveMedia?: boolean;
  publishedPost?: ReturnType<typeof post> | null;
}) {
  return {
    __typename: 'PostRequest' as const,
    authorProfile: author,
    bodyText,
    contentWarning,
    id: `post-request-card-node-${id}`,
    media: [
      {
        __typename: 'CreatePostMedia' as const,
        altText: media.altText,
        applyNightshade: false,
        media,
        mediaId: media.id,
      },
    ],
    post: publishedPost,
    requestId: `post-request-card-${id}`,
    status,
    sensitiveMedia,
  };
}

const processing = request({
  bodyText: '빛이 천천히 번지는 저녁 하늘을 기록했어요.',
  id: 'processing',
  status: 'PROCESSING',
});
const failed = request({
  bodyText: '노을 아래 걷던 순간을 담았어요.',
  contentWarning: '노을 풍경',
  id: 'failed',
  status: 'FAILED',
});
const published = request({
  bodyText: '오늘의 하늘을 나눕니다.',
  id: 'published',
  publishedPost: post({
    bodyText: '오늘의 하늘을 나눕니다.',
    id: 'post-request-card-published-post',
    profile: author,
  }),
  sensitiveMedia: true,
  status: 'PUBLISHED',
});
const requests = [processing, failed, published];
const requestNodeIds = requests.map(({ id }) => id);

const PostRequestCardStoriesQuery = graphql`
  query PostRequestCardStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on PostRequest {
        id
        ...PostRequestCard_request @alias(as: "card")
      }
    }
  }
`;

function useStoryRequests() {
  const data = useLazyLoadQuery<Query>(PostRequestCardStoriesQuery, { ids: requestNodeIds });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'PostRequest' || !node.card) {
      throw new Error(
        'PostRequestCardStoriesQuery must return PostRequest fragments in fixture order.',
      );
    }
    return { id: node.id, request: node.card };
  });
}

function requireRequest(requests: ReturnType<typeof useStoryRequests>, requestNodeId: string) {
  const result = requests.find((candidate) => candidate.id === requestNodeId);
  if (!result) {
    throw new Error(`Missing PostRequestCard fixture: ${requestNodeId}.`);
  }
  return result;
}

function PostRequestCardFixture({
  onRewrite,
  requestNodeId = processing.id,
}: {
  onRewrite: (requestId: string) => void;
  requestNodeId?: string;
}) {
  const storyRequests = useStoryRequests();
  const selected = requireRequest(storyRequests, requestNodeId);

  return (
    <Catalog>
      <PostRequestCard onRewrite={onRewrite} request={selected.request} />
    </Catalog>
  );
}

function RepresentativeStatesCatalog({ onRewrite }: { onRewrite: (requestId: string) => void }) {
  const storyRequests = useStoryRequests();

  return (
    <Catalog>
      <Section title="Processing">
        <PostRequestCard request={requireRequest(storyRequests, processing.id).request} />
      </Section>
      <Section title="Failed, available to rewrite">
        <PostRequestCard
          onRewrite={onRewrite}
          request={requireRequest(storyRequests, failed.id).request}
        />
      </Section>
      <Section title="Published, sensitive media hidden">
        <PostRequestCard request={requireRequest(storyRequests, published.id).request} />
      </Section>
    </Catalog>
  );
}

const meta = {
  args: { onRewrite: fn(), requestNodeId: processing.id },
  argTypes: {
    onRewrite: { action: 'rewrite', control: false, table: { disable: true } },
    requestNodeId: { control: 'select', options: requestNodeIds },
  },
  component: PostRequestCardFixture,
  parameters: {
    layout: 'padded',
    relay: {
      data: { nodes: requests },
      operationResponses: {
        PostRequestCardRefetchQuery: { data: { node: processing } },
      },
    },
  },
  title: 'KOSMO/Patterns/PostRequestCard',
} satisfies Meta<typeof PostRequestCardFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: { controls: { disable: false, include: ['requestNodeId'] } },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: ({ onRewrite }) => <RepresentativeStatesCatalog onRewrite={onRewrite} />,
};
