import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { PostRequestComposer } from '@/components/post/PostRequestComposer';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostRequestComposerStoriesQuery as Query } from './__generated__/PostRequestComposerStoriesQuery.graphql';

const authorProfile = profile({
  displayName: '코스모 작가',
  handle: 'kosmo',
  id: 'post-request-composer-author',
  relativeHandle: '@kosmo',
});

function request({
  bodyText,
  id,
  replyParentId = null,
  repostSourceId = null,
  status,
}: {
  bodyText: string;
  id: string;
  replyParentId?: string | null;
  repostSourceId?: string | null;
  status: 'FAILED' | 'CANCELLED';
}) {
  return {
    __typename: 'PostRequest' as const,
    authorProfile,
    draft: {
      __typename: 'PostRequestDraft' as const,
      bodyText,
      contentWarning: null,
      media: [],
      mentions: [],
      replyParent: null,
      replyParentId,
      repostSource: null,
      repostSourceId,
      sensitiveMedia: false,
      visibility: 'UNLISTED' as const,
    },
    id: 'post-request-composer-node-' + id,
    requestId: 'post-request-composer-' + id,
    status,
  };
}

const failedRequest = request({
  bodyText: '다시 이어서 작성할 게시글입니다.',
  id: 'failed',
  status: 'FAILED',
});
const cancelledRequest = request({
  bodyText: '취소된 요청에서 복원할 게시글입니다.',
  id: 'cancelled',
  status: 'CANCELLED',
});
const missingReplyRequest = request({
  bodyText: '답글 대상을 확인할 수 없는 요청입니다.',
  id: 'missing-reply',
  replyParentId: 'post-request-composer-missing-reply',
  status: 'FAILED',
});
const missingQuoteRequest = request({
  bodyText: '인용 게시글을 확인할 수 없는 요청입니다.',
  id: 'missing-quote',
  repostSourceId: 'post-request-composer-missing-quote',
  status: 'FAILED',
});
const storyRequests = [failedRequest, cancelledRequest, missingReplyRequest, missingQuoteRequest];
const storyRequestIds = storyRequests.map(({ id }) => id);

const PostRequestComposerStoriesQuery = graphql`
  query PostRequestComposerStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on PostRequest {
        id
        ...PostRequestComposer_request @alias(as: "composer")
      }
    }
  }
`;

function useStoryRequests() {
  const data = useLazyLoadQuery<Query>(PostRequestComposerStoriesQuery, { ids: storyRequestIds });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'PostRequest' || !node.composer) {
      throw new Error(
        'PostRequestComposerStoriesQuery must return request fragments in fixture order.',
      );
    }
    return { id: node.id, request: node.composer };
  });
}

function requireRequest(requests: ReturnType<typeof useStoryRequests>, id: string) {
  const result = requests.find((candidate) => candidate.id === id);
  if (!result) {
    throw new Error('Missing post request composer fixture: ' + id + '.');
  }
  return result;
}

function PostRequestComposerFixture({ onBack }: { onBack: () => void }) {
  const requestRef = requireRequest(useStoryRequests(), failedRequest.id);

  return (
    <Catalog>
      <PostRequestComposer onBack={onBack} request={requestRef.request} />
    </Catalog>
  );
}

function RepresentativeStatesCatalog({ onBack }: { onBack: () => void }) {
  const requests = useStoryRequests();

  return (
    <Catalog>
      <Section title="FAILED">
        <PostRequestComposer
          onBack={onBack}
          request={requireRequest(requests, failedRequest.id).request}
        />
      </Section>
      <Section title="CANCELLED">
        <PostRequestComposer
          onBack={onBack}
          request={requireRequest(requests, cancelledRequest.id).request}
        />
      </Section>
      <Section title="Missing reply context">
        <PostRequestComposer
          onBack={onBack}
          request={requireRequest(requests, missingReplyRequest.id).request}
        />
      </Section>
      <Section title="Missing quote context">
        <PostRequestComposer
          onBack={onBack}
          request={requireRequest(requests, missingQuoteRequest.id).request}
        />
      </Section>
    </Catalog>
  );
}

const meta = {
  args: { onBack: fn() },
  argTypes: {
    onBack: { action: 'back', control: false },
  },
  component: PostRequestComposerFixture,
  parameters: {
    layout: 'padded',
    relay: {
      data: { nodes: storyRequests },
      operationResponses: {
        PostComposerAccountQuery: {
          data: {
            me: { __typename: 'Account', id: 'post-request-composer-account' },
          },
        },
      },
    },
  },
  title: 'KOSMO/Patterns/PostRequestComposer',
} satisfies Meta<typeof PostRequestComposerFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: ({ onBack }) => <RepresentativeStatesCatalog onBack={onBack} />,
};
