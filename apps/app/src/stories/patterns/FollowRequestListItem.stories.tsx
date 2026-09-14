import { graphql, useLazyLoadQuery } from 'react-relay';
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

const meta = {
  args: { requestId: availableRequest.id },
  argTypes: {
    requestId: { control: 'select', options: storyRequestIds },
  },
  component: FollowRequestListItemFixture,
  parameters: {
    layout: 'padded',
    relay: { data: { nodes: storyRequests } },
  },
  title: 'KOSMO/Patterns/FollowRequestListItem',
} satisfies Meta<typeof FollowRequestListItemFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: { controls: { disable: false, include: ['requestId'] } },
};

export const RepresentativeStates: Story = {
  render: () => <FollowRequestCatalog />,
};
