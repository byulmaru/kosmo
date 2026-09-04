import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { FollowRequestListItem } from '@/components/follow-request/FollowRequestListItem';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FollowRequestListItemStoriesQuery as FollowRequestListItemStoriesQueryType } from './__generated__/FollowRequestListItemStoriesQuery.graphql';

const requester = profile({
  avatar: { id: 'follow-request-story-avatar', url: appleTouchIconUrl },
  displayName: '별빛 여행자',
  id: 'follow-request-story-requester',
  relativeHandle: '@starlight',
});
const availableRequest = {
  __typename: 'ProfileFollowRequest' as const,
  follower: requester,
  id: 'follow-request-story-available',
};
const missingRequest = {
  __typename: 'ProfileFollowRequest' as const,
  follower: null,
  id: 'follow-request-story-missing',
};
const storyRequests = [availableRequest, missingRequest];
const storyRequestIds = storyRequests.map(({ id }) => id);

const FollowRequestListItemStoriesQuery = graphql`
  query FollowRequestListItemStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on ProfileFollowRequest {
        id
        ...FollowRequestListItem_request @alias(as: "request")
      }
    }
  }
`;

function useStoryRequests() {
  const data = useLazyLoadQuery<FollowRequestListItemStoriesQueryType>(
    FollowRequestListItemStoriesQuery,
    { ids: storyRequestIds },
  );

  return data.nodes.map((node) => {
    if (node?.__typename !== 'ProfileFollowRequest' || !node.request) {
      throw new Error(
        'FollowRequestListItemStoriesQuery must return request fragments in fixture order.',
      );
    }
    return { id: node.id, request: node.request };
  });
}

function requireRequest(requests: ReturnType<typeof useStoryRequests>, id: string) {
  const result = requests.find((request) => request.id === id);
  if (!result) {
    throw new Error(`Missing follow request fixture: ${id}.`);
  }
  return result;
}

function FollowRequestListItemFixture({ requestId = availableRequest.id }: { requestId?: string }) {
  const requests = useStoryRequests();
  const request = requireRequest(requests, requestId);

  return (
    <Catalog>
      <FollowRequestListItem
        connectionId="follow-request-story-connection"
        request={request.request}
      />
    </Catalog>
  );
}

function FollowRequestCatalog() {
  const requests = useStoryRequests();

  return (
    <Catalog>
      <Section title="Available requester">
        <FollowRequestListItem
          connectionId="follow-request-story-connection"
          request={requireRequest(requests, availableRequest.id).request}
        />
      </Section>
      <Section title="Missing requester">
        <FollowRequestListItem
          connectionId="follow-request-story-connection"
          request={requireRequest(requests, missingRequest.id).request}
        />
      </Section>
    </Catalog>
  );
}

const approveRetryResponse = {
  approveProfileFollowRequest: {
    followeeProfile: { followersCount: 1, id: 'follow-request-story-followee' },
    followerProfile: { id: requester.id, followingCount: requester.followingCount + 1 },
    profileFollow: {
      follower: { id: requester.id },
      followee: { id: 'follow-request-story-followee' },
      id: 'follow-request-story-follow',
    },
    profileFollowRequestId: 'follow-request-story-other',
  },
};
const rejectRetryResponse = {
  rejectProfileFollowRequest: {
    followeeProfile: { id: 'follow-request-story-followee' },
    profileFollowRequestId: 'follow-request-story-other',
  },
};

const meta = {
  args: { requestId: availableRequest.id },
  argTypes: {
    requestId: { control: 'select', options: storyRequestIds },
  },
  component: FollowRequestListItemFixture,
  excludeStories: [
    'ApproveFailureAndRetry',
    'ApprovePending',
    'RejectFailureAndRetry',
    'RejectPending',
  ],
  parameters: {
    layout: 'centered',
    relay: { data: { nodes: storyRequests } },
  },
  title: 'KOSMO/Components/FollowRequestListItem',
} satisfies Meta<typeof FollowRequestListItemFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: { controls: { disable: false, include: ['requestId'] } },
};

export const RepresentativeStates: Story = {
  render: () => <FollowRequestCatalog />,
};

export const LayoutContract: Story = {
  render: () => <FollowRequestCatalog />,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approveButton = canvas.getByRole('button', {
      name: '별빛 여행자 팔로우 요청 승인',
    });
    const rejectButton = canvas.getByRole('button', {
      name: '별빛 여행자 팔로우 요청 거절',
    });
    expect(approveButton).toBeEnabled();
    expect(rejectButton).toBeEnabled();
    expect(approveButton.getBoundingClientRect().height).toBe(32);
    expect(approveButton.getBoundingClientRect().width).toBe(32);
    expect(approveButton.querySelector('svg')).toBeInTheDocument();
    expect(rejectButton.getBoundingClientRect().height).toBe(32);
    expect(rejectButton.getBoundingClientRect().width).toBe(32);
    expect(rejectButton.querySelector('svg')).toBeInTheDocument();
    expect(canvas.getByLabelText('별빛 여행자 프로필 이미지').querySelector('img')).toHaveAttribute(
      'src',
      appleTouchIconUrl,
    );
    expect(canvas.getByText('확인할 수 없는 프로필')).toBeVisible();
    expect(
      canvas.queryByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 승인' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 거절' }),
    ).toBeEnabled();
  },
};

export const ApprovePending: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' })).toBeDisabled();
  },
};

export const RejectPending: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' }));
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' })).toBeDisabled();
  },
};

export const ApproveFailureAndRetry: Story = {
  parameters: {
    relay: {
      operationResponses: {
        FollowRequestListItemApproveMutation: {
          sequence: [{ error: '승인 mutation 실패' }, { data: approveRetryResponse }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 요청을 승인하지 못했어요',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인 다시 시도' }),
    );
    await expect(
      canvas.findByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }),
    ).resolves.toBeEnabled();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const RejectFailureAndRetry: Story = {
  parameters: {
    relay: {
      operationResponses: {
        FollowRequestListItemRejectMutation: {
          sequence: [{ error: '거절 mutation 실패' }, { data: rejectRetryResponse }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 요청을 거절하지 못했어요',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절 다시 시도' }),
    );
    await expect(
      canvas.findByRole('button', { name: '별빛 여행자 팔로우 요청 거절' }),
    ).resolves.toBeEnabled();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
