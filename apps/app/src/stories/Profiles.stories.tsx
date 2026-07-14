import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { FollowButton } from '@/components/profile/FollowButton';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { followersProfile, followingProfile, profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfilesStoriesQuery as ProfilesStoriesQueryType } from './__generated__/ProfilesStoriesQuery.graphql';

const followable = profile({ id: 'profile-followable' });
const followingOwnerId = 'profile-following-content';
const followed = profile({
  id: 'profile-followed',
  viewerState: {
    follow: { follower: { id: followingOwnerId }, id: 'following-edge-0' },
    isSelf: false,
  },
});
const self = profile({
  displayName: '내 프로필',
  id: 'profile-self',
  viewerState: { follow: null, isSelf: true },
});
const remote = profile({
  bio: '먼 인스턴스에서 온 아주 긴 한 줄 소개가 컨테이너 폭을 넘겨도 레이아웃은 유지됩니다.',
  displayName: '아주 긴 표시 이름을 가진 먼 우주의 사용자',
  handle: 'remote-user',
  id: 'profile-remote',
  instance: { kind: 'ACTIVITYPUB' },
  relativeHandle: '@remote-user@very-long-instance.example',
});
const noBio = profile({ bio: null, id: 'profile-no-bio' });
const noViewer = profile({ id: 'profile-no-viewer', viewerState: null });
const followersEmpty = { ...followersProfile([]), id: 'profile-followers-empty' };
const followersContent = {
  ...followersProfile([followable, followed], { hasNext: true }),
  id: 'profile-followers-content',
};
const followingEmpty = { ...followingProfile([]), id: 'profile-following-empty' };
const followingContent = {
  ...followingProfile([followed]),
  id: followingOwnerId,
};

const storyProfiles = [
  followable,
  followed,
  self,
  remote,
  noBio,
  noViewer,
  followersEmpty,
  followersContent,
  followingEmpty,
  followingContent,
];

const ProfilesStoriesQuery = graphql`
  query ProfilesStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...FollowButton_profile @alias(as: "followButton")
        ...ProfileConnectionList_followersProfile @alias(as: "followersList")
        ...ProfileConnectionList_followingProfile @alias(as: "followingList")
        ...ProfileHero_profile @alias(as: "hero")
        ...ProfileListItem_profile @alias(as: "listItem")
        ...ProfileNameBlock_profile @alias(as: "nameBlock")
      }
    }
  }
`;

type ProfileNode = Extract<
  NonNullable<ProfilesStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Profile' }
>;

function useStoryProfiles(): ReadonlyArray<ProfileNode> {
  const data = useLazyLoadQuery<ProfilesStoriesQueryType>(ProfilesStoriesQuery, {
    ids: storyProfiles.map(({ id }) => id),
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile') {
      throw new Error('ProfilesStoriesQuery must return Profile nodes in fixture order.');
    }
    return node;
  });
}

function requireProfile(profiles: ReadonlyArray<ProfileNode>, index: number): ProfileNode {
  const result = profiles[index];
  if (!result) {
    throw new Error(`Missing profile fixture at index ${index}.`);
  }
  return result;
}

function requireFragment<T>(fragment: T | null | undefined, label: string): T {
  if (!fragment) {
    throw new Error(`Missing ${label} fragment reference.`);
  }
  return fragment;
}

function ProfileCatalog() {
  const profiles = useStoryProfiles();
  const followableRef = requireProfile(profiles, 0);
  const remoteRef = requireProfile(profiles, 3);
  const noBioRef = requireProfile(profiles, 4);

  return (
    <Catalog>
      <Section title="Name blocks · local / remote">
        <ProfileNameBlock profile={requireFragment(followableRef.nameBlock, 'name block')} />
        <ProfileNameBlock profile={requireFragment(remoteRef.nameBlock, 'remote name block')} />
      </Section>

      <Section title="Hero · default / no bio / remote / loading">
        <ProfileHero
          action={
            <FollowButton profile={requireFragment(followableRef.followButton, 'follow button')} />
          }
          profile={requireFragment(followableRef.hero, 'profile hero')}
        />
        <ProfileHero profile={requireFragment(noBioRef.hero, 'no-bio profile hero')} />
        <ProfileHero profile={requireFragment(remoteRef.hero, 'remote profile hero')} />
        <ProfileHero loading />
      </Section>
    </Catalog>
  );
}

function FollowButtonStory() {
  const profile = requireProfile(useStoryProfiles(), 0);
  return <FollowButton profile={requireFragment(profile.followButton, 'follow button')} />;
}

function RemoteFollowButtonStory() {
  const profile = requireProfile(useStoryProfiles(), 3);
  return <FollowButton profile={requireFragment(profile.followButton, 'follow button')} />;
}

function ProfileListCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Followable">
        <ProfileListItem
          linked
          profile={requireFragment(requireProfile(profiles, 0).listItem, 'followable list item')}
        />
      </Section>
      <Section title="Following">
        <ProfileListItem
          linked
          profile={requireFragment(requireProfile(profiles, 1).listItem, 'following list item')}
        />
      </Section>
      <Section title="No viewer state · action hidden">
        <ProfileListItem
          profile={requireFragment(requireProfile(profiles, 5).listItem, 'no-viewer list item')}
        />
      </Section>
      <Section title="Self · action hidden">
        <ProfileListItem
          profile={requireFragment(requireProfile(profiles, 2).listItem, 'self list item')}
        />
      </Section>
      <Section title="Long remote content">
        <ProfileListItem
          linked
          profile={requireFragment(requireProfile(profiles, 3).listItem, 'remote list item')}
        />
      </Section>
    </Catalog>
  );
}

function ConnectionCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Followers · loading">
        <ProfileConnectionListState kind="followers" state="loading" />
      </Section>
      <Section title="Followers · error">
        <ProfileConnectionListState kind="followers" onRetry={() => undefined} state="error" />
      </Section>
      <Section title="Followers · empty">
        <ProfileConnectionList
          kind="followers"
          profile={requireFragment(
            requireProfile(profiles, 6).followersList,
            'empty followers list',
          )}
        />
      </Section>
      <Section title="Followers · content and more">
        <ProfileConnectionList
          kind="followers"
          profile={requireFragment(requireProfile(profiles, 7).followersList, 'followers list')}
        />
      </Section>
      <Section title="Following · loading">
        <ProfileConnectionListState kind="following" state="loading" />
      </Section>
      <Section title="Following · error">
        <ProfileConnectionListState kind="following" onRetry={() => undefined} state="error" />
      </Section>
      <Section title="Following · empty">
        <ProfileConnectionList
          kind="following"
          profile={requireFragment(
            requireProfile(profiles, 8).followingList,
            'empty following list',
          )}
        />
      </Section>
      <Section title="Following · content and last page">
        <ProfileConnectionList
          kind="following"
          profile={requireFragment(requireProfile(profiles, 9).followingList, 'following list')}
        />
      </Section>
    </Catalog>
  );
}

function FollowersWithNextPage() {
  const profile = requireProfile(useStoryProfiles(), 7);
  return (
    <Catalog>
      <ProfileConnectionList
        kind="followers"
        profile={requireFragment(profile.followersList, 'followers list')}
      />
    </Catalog>
  );
}

function FollowingWithFollowedProfile() {
  const profile = requireProfile(useStoryProfiles(), 9);
  return (
    <Catalog>
      <ProfileConnectionList
        kind="following"
        profile={requireFragment(profile.followingList, 'following list')}
      />
    </Catalog>
  );
}

const meta = {
  component: ProfileCatalog,
  parameters: {
    relay: { data: { nodes: storyProfiles } },
    router: { pathname: '/@kosmo' },
  },
  title: 'KOSMO/Profiles/Profile',
} satisfies Meta<typeof ProfileCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeroNameAndLoadingStates: Story = {
  play: async ({ canvasElement }) => {
    expect(
      canvasElement.querySelector('a[href="/@remote-user@very-long-instance.example/following"]'),
    ).toBeInTheDocument();
    expect(
      canvasElement.querySelector('a[href="/@remote-user@very-long-instance.example/followers"]'),
    ).toBeInTheDocument();
  },
};

export const ListAndFollowStates: Story = {
  play: async ({ canvasElement }) => {
    expect(
      canvasElement.querySelector('a[href="/@remote-user@very-long-instance.example"]'),
    ).toBeInTheDocument();
  },
  render: () => <ProfileListCatalog />,
};

export const FollowSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '처리 중' })).resolves.toBeDisabled();
  },
  render: () => <FollowButtonStory />,
};

export const FollowErrorInteraction: Story = {
  parameters: { relay: { mutationError: '팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
  },
  render: () => <FollowButtonStory />,
};

export const RemoteFollowIsHidden: Story = {
  play: ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: '팔로우' })).not.toBeInTheDocument();
  },
  render: () => <RemoteFollowButtonStory />,
};

export const UnfollowRemovesCachedConnectionEdge: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        unfollowProfile: {
          followeeProfile: {
            ...followed,
            followersCount: followed.followersCount - 1,
            viewerState: { follow: null, isSelf: false },
          },
          followerProfile: {
            ...followingContent,
            followingCount: followingContent.followingCount - 1,
          },
          profileFollowId: 'following-edge-0',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByText('아직 팔로잉이 없어요')).resolves.toBeVisible();
  },
  render: () => <FollowingWithFollowedProfile />,
};

export const ConnectionLoadingErrorEmptyAndContent: Story = {
  render: () => <ConnectionCatalog />,
};

export const ConnectionNextPageLoadingInteraction: Story = {
  parameters: { relay: { paginationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('button', { name: '불러오는 중' })).resolves.toBeDisabled();
  },
  render: () => <FollowersWithNextPage />,
};

export const ConnectionNextPageErrorInteraction: Story = {
  parameters: { relay: { paginationError: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로워를 더 불러오지 못했어요',
    );
  },
  render: () => <FollowersWithNextPage />,
};
