import { Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import FollowRequestsScreen from '@/app/(tabs)/(protected)/follow-requests';
import {
  FollowRequestList,
  FollowRequestListState,
} from '@/components/follow-request/FollowRequestList';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FollowRequestsStoriesQuery as FollowRequestsStoriesQueryType } from './__generated__/FollowRequestsStoriesQuery.graphql';

const requesterA = profile({
  avatar: {
    id: 'follow-request-avatar-a',
    url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect width="56" height="56" fill="%237c3aed"/%3E%3C/svg%3E',
  },
  displayName: '별빛 여행자',
  handle: 'starlight',
  id: 'follow-request-requester-a',
  relativeHandle: '@starlight',
});
const requesterB = profile({
  displayName: '은하 기록자',
  handle: 'galaxy',
  id: 'follow-request-requester-b',
  relativeHandle: '@galaxy',
});

function followRequest(id: string, follower: ReturnType<typeof profile> | null) {
  return {
    __typename: 'ProfileFollowRequest' as const,
    follower,
    id,
  };
}

function followRequestProfile({
  hasNext = false,
  id,
  requests,
}: {
  hasNext?: boolean;
  id: string;
  requests: Array<ReturnType<typeof followRequest>>;
}) {
  return {
    ...profile({ id, relativeHandle: `@${id}` }),
    incomingProfileFollowRequests: {
      __typename: 'ProfileIncomingProfileFollowRequestsConnection' as const,
      edges: requests.map((node, index) => ({
        __typename: 'ProfileIncomingProfileFollowRequestsConnectionEdge' as const,
        cursor: `follow-request-cursor-${index}`,
        node,
      })),
      pageInfo: {
        endCursor: requests.length ? `follow-request-cursor-${requests.length - 1}` : null,
        hasNextPage: hasNext,
        hasPreviousPage: false,
        startCursor: requests.length ? 'follow-request-cursor-0' : null,
      },
    },
  };
}

const emptyProfile = followRequestProfile({ id: 'follow-request-profile-empty', requests: [] });
const contentProfile = followRequestProfile({
  id: 'follow-request-profile-content',
  requests: [
    followRequest('follow-request-a', requesterA),
    followRequest('follow-request-b', requesterB),
    followRequest('follow-request-unavailable', null),
  ],
});
const paginationProfile = followRequestProfile({
  hasNext: true,
  id: 'follow-request-profile-pagination',
  requests: [followRequest('follow-request-page-a', requesterA)],
});
const switchedProfile = followRequestProfile({
  id: 'follow-request-profile-switched',
  requests: [followRequest('follow-request-a', requesterB)],
});
const requesterACacheProfile = {
  ...requesterA,
  incomingProfileFollowRequests: emptyProfile.incomingProfileFollowRequests,
};
const paginationNextRequest = followRequest('follow-request-page-b', requesterB);
const paginationNextPage = {
  node: {
    __typename: 'Profile' as const,
    id: paginationProfile.id,
    incomingProfileFollowRequests: {
      __typename: 'ProfileIncomingProfileFollowRequestsConnection' as const,
      edges: [
        {
          __typename: 'ProfileIncomingProfileFollowRequestsConnectionEdge' as const,
          cursor: 'follow-request-cursor-next',
          node: paginationNextRequest,
        },
      ],
      pageInfo: {
        endCursor: 'follow-request-cursor-next',
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: 'follow-request-cursor-next',
      },
    },
  },
};
const storyProfiles = [emptyProfile, contentProfile, paginationProfile, requesterACacheProfile];

const FollowRequestsStoriesQuery = graphql`
  query FollowRequestsStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        followersCount
        followingCount
        ...FollowRequestList_profile @alias(as: "followRequestList")
      }
    }
  }
`;

type ProfileNode = Extract<
  NonNullable<FollowRequestsStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Profile' }
>;

function useStoryProfiles(): ReadonlyArray<ProfileNode> {
  const data = useLazyLoadQuery<FollowRequestsStoriesQueryType>(FollowRequestsStoriesQuery, {
    ids: storyProfiles.map(({ id }) => id),
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.followRequestList) {
      throw new Error('FollowRequestsStoriesQuery must return Profile fragments in fixture order.');
    }
    return node;
  });
}

function requireProfile(profiles: ReadonlyArray<ProfileNode>, index: number) {
  const result = profiles[index];
  if (!result?.followRequestList) {
    throw new Error(`Missing follow request profile fixture at index ${index}.`);
  }
  return result;
}

function FollowRequestCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Loading">
        <FollowRequestListState state="loading" />
      </Section>
      <Section title="Error and retry">
        <FollowRequestListState onRetry={() => undefined} state="error" />
      </Section>
      <Section title="Profile required">
        <FollowRequestListState state="profileRequired" />
      </Section>
      <Section title="Empty">
        <FollowRequestList profile={requireProfile(profiles, 0).followRequestList!} />
      </Section>
      <Section title="Regular and unavailable requesters">
        <FollowRequestList profile={requireProfile(profiles, 1).followRequestList!} />
      </Section>
    </Catalog>
  );
}

function ContentList() {
  return <FollowRequestList profile={requireProfile(useStoryProfiles(), 1).followRequestList!} />;
}

function PaginationList() {
  return <FollowRequestList profile={requireProfile(useStoryProfiles(), 2).followRequestList!} />;
}

function ApprovalNormalizationList() {
  const profiles = useStoryProfiles();
  const followee = requireProfile(profiles, 1);
  const follower = requireProfile(profiles, 3);

  return (
    <>
      <Text>받는 프로필 팔로워 수 {followee.followersCount}</Text>
      <Text>요청 프로필 팔로잉 수 {follower.followingCount}</Text>
      <FollowRequestList profile={followee.followRequestList!} />
    </>
  );
}

function ActorSwitchScreen() {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor(switchedProfile.id)}>프로필 전환</Button>
      <FollowRequestsScreen />
    </>
  );
}

const approveMutationResponse = {
  approveProfileFollowRequest: {
    followeeProfile: {
      __typename: 'Profile',
      followersCount: contentProfile.followersCount + 1,
      id: contentProfile.id,
    },
    followerProfile: {
      __typename: 'Profile',
      followingCount: requesterA.followingCount + 1,
      id: requesterA.id,
    },
    profileFollow: {
      __typename: 'ProfileFollow',
      followee: { __typename: 'Profile', id: contentProfile.id },
      follower: { __typename: 'Profile', id: requesterA.id },
      id: 'profile-follow-approved-a',
    },
    profileFollowRequestId: 'follow-request-a',
  },
};

const rejectMutationResponse = {
  rejectProfileFollowRequest: {
    followeeProfile: { __typename: 'Profile', id: contentProfile.id },
    profileFollowRequestId: 'follow-request-unavailable',
  },
};

const meta = {
  component: FollowRequestCatalog,
  parameters: {
    relay: { data: { nodes: storyProfiles } },
    router: { pathname: '/follow-requests' },
  },
  title: 'KOSMO/Screens/Follow Requests',
} satisfies Meta<typeof FollowRequestCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatesAndRequesterRows: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getAllByRole('heading', { name: '팔로워 요청' })).toHaveLength(5);
    expect(canvas.getByText('받은 팔로우 요청이 없어요')).toBeVisible();
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toHaveAttribute(
      'href',
      '/@starlight',
    );
    expect(canvas.getByText('@starlight')).toBeVisible();
    const approveButton = canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' });
    const rejectButton = canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' });
    expect(approveButton).toBeEnabled();
    expect(rejectButton).toBeEnabled();
    expect(canvas.getByText('확인할 수 없는 프로필')).toBeVisible();
    expect(
      canvas.queryByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 승인' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 거절' }),
    ).toBeEnabled();
    expect(canvasElement.textContent).not.toMatch(/2026-|분 전|시간 전/);
  },
};

export const RowLocalPending: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));

    await expect(
      canvas.findByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }),
    ).resolves.toBeDisabled();
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '은하 기록자 팔로우 요청 승인' })).toBeEnabled();
  },
  render: () => <ContentList />,
};

export const MutationFailureAndSameActionRetry: Story = {
  parameters: { relay: { mutationError: '승인 mutation 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));

    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 요청을 승인하지 못했어요',
    );
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toBeVisible();
    expect(
      canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인 다시 시도' }),
    ).toBeEnabled();
  },
  render: () => <ContentList />,
};

export const ApproveSuccessRemovesExactRequest: Story = {
  parameters: { relay: { mutationResponse: approveMutationResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByText(`받는 프로필 팔로워 수 ${contentProfile.followersCount}`),
    ).toBeVisible();
    expect(canvas.getByText(`요청 프로필 팔로잉 수 ${requesterA.followingCount}`)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));

    await expect(
      canvas.findByRole('link', { name: '은하 기록자 프로필로 이동' }),
    ).resolves.toBeVisible();
    expect(
      canvas.getByText(`받는 프로필 팔로워 수 ${contentProfile.followersCount + 1}`),
    ).toBeVisible();
    expect(
      canvas.getByText(`요청 프로필 팔로잉 수 ${requesterA.followingCount + 1}`),
    ).toBeVisible();
    expect(
      canvas.queryByRole('link', { name: '별빛 여행자 프로필로 이동' }),
    ).not.toBeInTheDocument();
    expect(canvas.getByText('확인할 수 없는 프로필')).toBeVisible();
  },
  render: () => <ApprovalNormalizationList />,
};

export const RejectUnavailableSuccess: Story = {
  parameters: { relay: { mutationResponse: rejectMutationResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 거절' }),
    );

    await expect(
      canvas.findByRole('link', { name: '별빛 여행자 프로필로 이동' }),
    ).resolves.toBeVisible();
    expect(canvas.queryByText('확인할 수 없는 프로필')).not.toBeInTheDocument();
  },
  render: () => <ContentList />,
};

export const PaginationFailurePreservesRows: Story = {
  parameters: {
    relay: {
      paginationResponses: [
        { error: '다음 팔로워 요청을 불러오지 못했습니다.' },
        { data: paginationNextPage },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로워 요청을 더 불러오지 못했어요',
    );
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(
      canvas.findByRole('link', { name: '은하 기록자 프로필로 이동' }),
    ).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
  render: () => <PaginationList />,
};

export const PaginationLoadingPreservesRows: Story = {
  parameters: { relay: { paginationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('팔로워 요청을 더 불러오는 중입니다.')).resolves.toBeVisible();
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toBeVisible();
  },
  render: () => <PaginationList />,
};

export const SelectedProfileScreen: Story = {
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'follow-request-session', selectedProfile: contentProfile },
      },
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toBeVisible();
  },
  render: () => <FollowRequestsScreen />,
};

export const LatePreviousActorMutationIsIsolated: Story = {
  parameters: {
    relay: {
      operationResponses: {
        FollowRequestListItemApproveMutation: [
          { data: approveMutationResponse, delayMs: 100 },
          { data: approveMutationResponse },
        ],
        FollowRequestsPageQuery: [
          {
            data: {
              currentSession: { id: 'follow-request-session-a', selectedProfile: contentProfile },
            },
          },
          {
            data: {
              currentSession: {
                id: 'follow-request-session-b',
                selectedProfile: switchedProfile,
              },
            },
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));
    await userEvent.click(canvas.getByRole('button', { name: '프로필 전환' }));

    await expect(
      canvas.findByRole('link', { name: '은하 기록자 프로필로 이동' }),
    ).resolves.toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(canvas.getByRole('link', { name: '은하 기록자 프로필로 이동' })).toBeVisible();
    expect(
      canvas.queryByRole('link', { name: '별빛 여행자 프로필로 이동' }),
    ).not.toBeInTheDocument();
  },
  render: () => <ActorSwitchScreen />,
};
