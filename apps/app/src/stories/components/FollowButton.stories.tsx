import { Suspense, useMemo } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, mocked, userEvent, within } from 'storybook/test';
import { trackAnalytics } from '@/analytics/client';
import { FollowButton } from '@/components/profile/FollowButton';
import { SessionProvider } from '@/session/SessionProvider';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { profile } from '../fixtures';
import { Catalog, Row, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FollowButtonStoriesQuery as FollowButtonStoriesQueryType } from './__generated__/FollowButtonStoriesQuery.graphql';

const followable = profile({
  avatar: { id: 'follow-button-avatar', url: '/profile-followable-avatar.png' },
  id: 'follow-button-followable',
  viewerState: { follow: null, followRequest: null, isSelf: false },
});
const following = profile({
  id: 'follow-button-following',
  viewerState: {
    follow: {
      follower: { followingCount: 42, id: 'profile-viewer' },
      id: 'follow-button-following-edge',
    },
    followRequest: null,
    isSelf: false,
  },
});
const requested = profile({
  id: 'follow-button-requested',
  viewerState: {
    follow: null,
    followRequest: { id: 'follow-button-request' },
    isSelf: false,
  },
});
const approvalRequired = profile({
  followPolicy: 'APPROVAL_REQUIRED',
  id: 'follow-button-approval-required',
  viewerState: { follow: null, followRequest: null, isSelf: false },
});
const self = profile({
  displayName: '내 프로필',
  id: 'follow-button-self',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});

const storyProfiles = [followable, following, requested, approvalRequired, self];
const storyProfileIds = storyProfiles.map(({ id }) => id);
const mutationRequestObserver = fn().mockName('FollowButton mutation');

function FollowButtonPlayground(args: Parameters<typeof FollowButtonFixture>[0]) {
  const operationResponses = useMemo(() => {
    const target = storyProfiles.find(({ id }) => id === args.profileId) ?? followable;
    const requiresApproval = target.followPolicy === 'APPROVAL_REQUIRED';
    const requestId = target.viewerState?.followRequest?.id ?? `request:${target.id}`;
    const follower = { id: 'profile-viewer', followingCount: 43 };
    const follow = { id: `follow:${target.id}`, follower };
    const followRequest = { id: requestId };
    return {
      FollowButtonFollowProfileMutation: {
        data: {
          followProfile: {
            followeeProfile: {
              ...target,
              viewerState: {
                isSelf: false,
                follow: requiresApproval ? null : follow,
                followRequest: requiresApproval ? followRequest : null,
              },
            },
            followerProfile: follower,
            result: requiresApproval
              ? { __typename: 'ProfileFollowRequest', id: requestId }
              : { __typename: 'ProfileFollow', id: follow.id },
          },
        },
      },
      FollowButtonUnfollowProfileMutation: {
        data: {
          unfollowProfile: {
            followeeProfile: {
              ...target,
              viewerState: { isSelf: false, follow: null, followRequest: null },
            },
            followerProfile: { ...follower, followingCount: 42 },
          },
        },
      },
      FollowButtonCancelProfileFollowRequestMutation: {
        data: { cancelProfileFollowRequest: { profileFollowRequestId: requestId } },
      },
    };
  }, [args.profileId]);

  return (
    <RelayStoryProvider
      mutationRequestObserver={mutationRequestObserver}
      operationResponses={operationResponses}
      queryData={meta.parameters.relay.data}
    >
      <Suspense fallback={null}>
        <FollowButtonFixture {...args} />
      </Suspense>
    </RelayStoryProvider>
  );
}

const FollowButtonStoriesQuery = graphql`
  query FollowButtonStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...FollowButton_profile @alias(as: "followButton")
      }
    }
  }
`;

function useStoryProfiles() {
  const data = useLazyLoadQuery<FollowButtonStoriesQueryType>(FollowButtonStoriesQuery, {
    ids: storyProfileIds,
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.followButton) {
      throw new Error('FollowButtonStoriesQuery must return Profile fragments in fixture order.');
    }
    return { followButton: node.followButton, id: node.id };
  });
}

function requireProfile(profiles: ReturnType<typeof useStoryProfiles>, id: string) {
  const result = profiles.find((profileNode) => profileNode.id === id);
  if (!result) {
    throw new Error(`Missing FollowButton profile fixture: ${id}.`);
  }
  return result;
}

function FollowButtonFixture({
  profileId = followable.id,
  size,
}: {
  profileId?: string;
  size?: 'compact' | 'medium';
}) {
  const profiles = useStoryProfiles();
  const target = requireProfile(profiles, profileId);

  return (
    <SessionProvider>
      <FollowButton profile={target.followButton} size={size} />
    </SessionProvider>
  );
}

function FollowButtonCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Sizes and initial relationship states">
        <Row>
          <FollowButton
            profile={requireProfile(profiles, followable.id).followButton}
            size="compact"
          />
          <FollowButton
            profile={requireProfile(profiles, following.id).followButton}
            size="medium"
          />
          <FollowButton
            profile={requireProfile(profiles, requested.id).followButton}
            size="compact"
          />
        </Row>
      </Section>
      <Section title="Self profile hides the action">
        <FollowButton profile={requireProfile(profiles, self.id).followButton} size="medium" />
      </Section>
    </Catalog>
  );
}

const followSuccessResponse = {
  followProfile: {
    followeeProfile: {
      ...followable,
      viewerState: {
        follow: {
          follower: { followingCount: followable.followingCount + 1, id: 'profile-viewer' },
          id: 'follow-button-success-edge',
        },
        followRequest: null,
        isSelf: false,
      },
    },
    followerProfile: { id: 'profile-viewer', followingCount: 43 },
    result: { __typename: 'ProfileFollow', id: 'follow-button-success-edge' },
  },
};

const requestSuccessResponse = {
  followProfile: {
    followeeProfile: {
      ...approvalRequired,
      viewerState: {
        follow: null,
        followRequest: { id: 'follow-button-request-success' },
        isSelf: false,
      },
    },
    followerProfile: { id: 'profile-viewer', followingCount: 42 },
    result: { __typename: 'ProfileFollowRequest', id: 'follow-button-request-success' },
  },
};

const unfollowSuccessResponse = {
  unfollowProfile: {
    followeeProfile: {
      ...following,
      followersCount: Math.max(following.followersCount - 1, 0),
      viewerState: { follow: null, followRequest: null, isSelf: false },
    },
    followerProfile: { id: 'profile-viewer', followingCount: 41 },
  },
};

const cancelSuccessResponse = {
  cancelProfileFollowRequest: {
    profileFollowRequestId: requested.viewerState?.followRequest?.id,
  },
};

const meta = {
  beforeEach: () => {
    mocked(trackAnalytics).mockClear();
    mutationRequestObserver.mockClear();
  },
  component: FollowButtonFixture,
  excludeStories: [
    'CancelError',
    'CancelPending',
    'CancelSuccess',
    'FollowError',
    'FollowPending',
    'FollowSuccess',
    'RequestError',
    'RequestPending',
    'RequestSuccess',
    'UnfollowError',
    'UnfollowPending',
    'UnfollowSuccess',
  ],
  parameters: {
    layout: 'centered',
    relay: {
      data: {
        currentSession: { id: 'follow-button-session', selectedProfile: { id: 'profile-viewer' } },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: storyProfiles,
      },
    },
  },
  title: 'KOSMO/Components/FollowButton',
} satisfies Meta<typeof FollowButtonFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <FollowButtonPlayground {...args} />,
  args: { profileId: followable.id, size: 'medium' },
  argTypes: {
    profileId: { control: 'select', options: storyProfileIds },
    size: { control: 'inline-radio', options: ['compact', 'medium'] },
  },
  parameters: {
    relay: { mutationRequestObserver },
    controls: { disable: false, include: ['profileId', 'size'] },
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <SessionProvider>
      <FollowButtonCatalog />
    </SessionProvider>
  ),
};

export const FollowSuccess: Story = {
  args: { profileId: followable.id, size: 'medium' },
  parameters: { relay: { mutationResponse: followSuccessResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
    expect(trackAnalytics).toHaveBeenCalledOnce();
    expect(trackAnalytics).toHaveBeenCalledWith('follow_succeeded', {
      result: 'follow',
      selected_profile_id: 'profile-viewer',
    });
  },
};

export const FollowPending: Story = {
  args: { profileId: followable.id, size: 'medium' },
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeDisabled();
  },
};

export const FollowError: Story = {
  args: { profileId: followable.id, size: 'medium' },
  parameters: { relay: { mutationError: '팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
    expect(trackAnalytics).not.toHaveBeenCalled();
  },
};

export const RequestSuccess: Story = {
  args: { profileId: approvalRequired.id, size: 'medium' },
  parameters: { relay: { mutationResponse: requestSuccessResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeEnabled();
  },
};

export const RequestPending: Story = {
  args: { profileId: approvalRequired.id, size: 'medium' },
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeDisabled();
  },
};

export const RequestError: Story = {
  args: { profileId: approvalRequired.id, size: 'medium' },
  parameters: { relay: { mutationError: '요청 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
  },
};

export const UnfollowSuccess: Story = {
  args: { profileId: following.id, size: 'medium' },
  parameters: { relay: { mutationResponse: unfollowSuccessResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
  },
};

export const UnfollowPending: Story = {
  args: { profileId: following.id, size: 'medium' },
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeDisabled();
  },
};

export const UnfollowError: Story = {
  args: { profileId: following.id, size: 'medium' },
  parameters: { relay: { mutationError: '언팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
  },
};

export const CancelSuccess: Story = {
  args: { profileId: requested.id, size: 'medium' },
  parameters: { relay: { mutationResponse: cancelSuccessResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '요청됨' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
  },
};

export const CancelPending: Story = {
  args: { profileId: requested.id, size: 'medium' },
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '요청됨' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeDisabled();
  },
};

export const CancelError: Story = {
  args: { profileId: requested.id, size: 'medium' },
  parameters: { relay: { mutationError: '취소 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '요청됨' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeEnabled();
  },
};
