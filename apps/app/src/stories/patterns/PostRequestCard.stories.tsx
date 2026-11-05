import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
type MediaFixture = {
  readonly __typename: 'Media';
  readonly altText: string | null;
  readonly id: string;
  readonly thumbhash: string | null;
  readonly url: string | null;
};
const mediaUrl =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8b7dea"/></svg>',
  );
const media: MediaFixture = {
  __typename: 'Media',
  altText: '보라색 하늘',
  id: 'post-request-card-media',
  thumbhash: null,
  url: mediaUrl,
};

function request({
  id,
  status,
  bodyText,
  contentWarning = null,
  sensitiveMedia = false,
  publishedPost = null,
  mediaItems,
}: {
  id: string;
  status: 'PROCESSING' | 'FAILED' | 'PUBLISHED';
  bodyText: string;
  contentWarning?: string | null;
  sensitiveMedia?: boolean;
  publishedPost?: ReturnType<typeof post> | null;
  mediaItems?: readonly MediaFixture[];
}) {
  return {
    __typename: 'PostRequest' as const,
    authorProfile: author,
    bodyText,
    contentWarning,
    id: `post-request-card-node-${id}`,
    media: mediaItems ?? [media],
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
const hashOnlyProcessing = request({
  bodyText: '처리 중인 이미지의 ThumbHash 미리보기예요.',
  id: 'hash-only-processing',
  mediaItems: [
    {
      __typename: 'Media',
      altText: '보라색 하늘',
      id: 'post-request-card-hash-only-media',
      thumbhash: '6RQCBwAA' + 'AAAAAAAAAAAAAAAAAAAAAAAA',
      url: null,
    },
  ],
  status: 'PROCESSING',
});
const missingThumbhashProcessing = request({
  bodyText: '이전 업로드 응답에는 ThumbHash가 없어요.',
  id: 'missing-thumbhash-processing',
  mediaItems: [
    {
      __typename: 'Media',
      altText: '하늘',
      id: 'post-request-card-missing-thumbhash-media',
      thumbhash: null,
      url: null,
    },
  ],
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
const requests = [processing, hashOnlyProcessing, missingThumbhashProcessing, failed, published];
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
  onCompose,
  requestNodeId = processing.id,
}: {
  onCompose: () => void;
  requestNodeId?: string;
}) {
  const storyRequests = useStoryRequests();
  const selected = requireRequest(storyRequests, requestNodeId);

  return (
    <Catalog>
      <PostRequestCard onCompose={onCompose} request={selected.request} />
    </Catalog>
  );
}

function RepresentativeStatesCatalog({ onCompose }: { onCompose: () => void }) {
  const storyRequests = useStoryRequests();

  return (
    <Catalog>
      <Section title="Processing">
        <PostRequestCard request={requireRequest(storyRequests, processing.id).request} />
      </Section>
      <Section title="Processing, ThumbHash fallback">
        <PostRequestCard request={requireRequest(storyRequests, hashOnlyProcessing.id).request} />
      </Section>
      <Section title="Processing, no preview metadata">
        <PostRequestCard
          request={requireRequest(storyRequests, missingThumbhashProcessing.id).request}
        />
      </Section>
      <Section title="Failed, available to compose">
        <PostRequestCard
          onCompose={onCompose}
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
  args: { onCompose: fn(), requestNodeId: processing.id },
  argTypes: {
    onCompose: { action: 'compose', control: false, table: { disable: true } },
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
  render: ({ onCompose }) => <RepresentativeStatesCatalog onCompose={onCompose} />,
};

const cancelRequestObserver = fn();

export const CancellationConfirmation: Story = {
  beforeEach: () => cancelRequestObserver.mockClear(),
  parameters: {
    controls: { disable: true },
    relay: {
      mutationRequestObserver: cancelRequestObserver,
      operationResponses: {
        PostRequestCardCancelMutation: {
          data: { cancelPostRequest: { request: { ...processing, status: 'CANCELLED' } } },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole('button', { name: '취소' });
    const open = async () => {
      await userEvent.click(trigger);
      const dialog = await body.findByRole('alertdialog', { name: '게시 요청을 취소할까요?' });
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: '계속 기다리기' })).toHaveFocus(),
      );
      expect(cancelRequestObserver).not.toHaveBeenCalled();
      return dialog;
    };
    const expectWaiting = async () => {
      await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(cancelRequestObserver).not.toHaveBeenCalled();
      expect(canvas.getByText('이미지 처리 중')).toBeVisible();
    };

    let dialog = await open();
    for (let i = 0; i < 4; i++) {
      await userEvent.tab();
      expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true);
    }
    await userEvent.click(within(dialog).getByRole('button', { name: '계속 기다리기' }));
    await expectWaiting();

    await open();
    await userEvent.keyboard('{Escape}');
    await expectWaiting();

    dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기', exact: true }));
    await expectWaiting();

    dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: '게시 취소' }));
    await waitFor(() => expect(cancelRequestObserver).toHaveBeenCalledTimes(1));
    expect(cancelRequestObserver).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PostRequestCardCancelMutation' }),
      { input: { requestId: 'post-request-card-processing' } },
    );
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(await canvas.findByRole('button', { name: '새 글 작성' })).toBeVisible();
    expect(canvas.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  },
};
