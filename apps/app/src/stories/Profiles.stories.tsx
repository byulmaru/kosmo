import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, mocked, userEvent, within } from 'storybook/test';
import { trackAnalytics } from '@/analytics/client';
import { FollowButton } from '@/components/profile/FollowButton';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { SessionProvider } from '@/session/SessionProvider';
import { followersProfile, followingProfile, profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfilesStoriesQuery as ProfilesStoriesQueryType } from './__generated__/ProfilesStoriesQuery.graphql';

const followable = profile({
  avatar: { id: 'media-profile-followable-avatar', url: '/profile-followable-avatar.png' },
  id: 'profile-followable',
});
const followingOwnerId = 'profile-following-content';
const followed = profile({
  avatar: { id: 'media-profile-followed-avatar', url: '/profile-followed-avatar.png' },
  id: 'profile-followed',
  viewerState: {
    follow: {
      follower: { followingCount: 42, id: followingOwnerId },
      id: 'following-edge-0',
    },
    followRequest: null,
    isSelf: false,
  },
});
const pending = profile({
  id: 'profile-pending',
  viewerState: {
    follow: null,
    followRequest: { id: 'follow-request-0' },
    isSelf: false,
  },
});
const self = profile({
  displayName: '내 프로필',
  id: 'profile-self',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});
const remote = profile({
  bio: '먼 인스턴스에서 온 아주 긴 한 줄 소개가 컨테이너 폭을 넘겨도 레이아웃은 유지됩니다.',
  displayName: '아주 긴 표시 이름을 가진 먼 우주의 사용자',
  handle: 'remote-user',
  id: 'profile-remote',
  instance: { kind: 'ACTIVITYPUB' },
  relativeHandle: '@remote-user@very-long-instance.example',
});
const remoteApprovalRequired = profile({
  followPolicy: 'APPROVAL_REQUIRED',
  handle: 'approval-required',
  id: 'profile-remote-approval-required',
  instance: { kind: 'ACTIVITYPUB' },
  relativeHandle: '@approval-required@remote.example',
});
const noBio = profile({ bio: null, id: 'profile-no-bio' });
const noViewer = profile({
  displayName: '이니셜 폴백 프로필',
  handle: 'initial-fallback',
  id: 'profile-no-viewer',
  relativeHandle: '@initial-fallback',
  viewerState: null,
});
const withImages = profile({
  avatar: { id: 'media-profile-avatar', url: '/apple-touch-icon.png' },
  header: { id: 'media-profile-header', url: '/og-default.png' },
  id: 'profile-with-images',
});
const withTags = profile({
  id: 'profile-with-tags',
  tags: [
    { id: 'hashtag-fediverse', name: 'Fediverse' },
    { id: 'hashtag-development', name: '개발' },
  ],
});
const maxLengthProfileTag = '가'.repeat(20);
const withManyLongTags = profile({
  id: 'profile-with-many-long-tags',
  tags: [
    { id: 'hashtag-craft', name: '공예' },
    { id: 'hashtag-photography', name: '사진' },
    { id: 'hashtag-reading', name: '독서' },
    { id: 'hashtag-music', name: '음악' },
    { id: 'hashtag-long', name: '아주긴프로필태그이름입니다' },
    { id: 'hashtag-max-length', name: maxLengthProfileTag },
  ],
});
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
  remoteApprovalRequired,
  pending,
  withImages,
  withTags,
  withManyLongTags,
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
  const withImagesRef = requireProfile(profiles, 12);
  const withTagsRef = requireProfile(profiles, 13);
  const withManyLongTagsRef = requireProfile(profiles, 14);

  return (
    <Catalog>
      <Section title="Name blocks · local / remote">
        <ProfileNameBlock profile={requireFragment(followableRef.nameBlock, 'name block')} />
        <ProfileNameBlock profile={requireFragment(remoteRef.nameBlock, 'remote name block')} />
      </Section>

      <Section title="Hero · default / images / no bio / remote / loading">
        <ProfileHero
          action={
            <FollowButton profile={requireFragment(followableRef.followButton, 'follow button')} />
          }
          profile={requireFragment(followableRef.hero, 'profile hero')}
        />
        <ProfileHero profile={requireFragment(withImagesRef.hero, 'profile hero with images')} />
        <ProfileHero profile={requireFragment(noBioRef.hero, 'no-bio profile hero')} />
        <ProfileHero profile={requireFragment(remoteRef.hero, 'remote profile hero')} />
        <ProfileHero loading />
      </Section>

      <Section title="Hero · tags empty / long / many / remote empty">
        <ProfileHero profile={requireFragment(followableRef.hero, 'empty tags profile hero')} />
        <ProfileHero profile={requireFragment(withTagsRef.hero, 'profile hero with tags')} />
        <View style={{ width: 240 }} testID="profile-tags-narrow-fixture">
          <ProfileHero
            profile={requireFragment(withManyLongTagsRef.hero, 'profile hero with many long tags')}
          />
        </View>
        <ProfileHero profile={requireFragment(remoteRef.hero, 'remote empty tags profile hero')} />
      </Section>
    </Catalog>
  );
}

function FollowButtonStory() {
  const profile = requireProfile(useStoryProfiles(), 0);
  return <FollowButton profile={requireFragment(profile.followButton, 'follow button')} />;
}

function AuthenticatedFollowButtonStory() {
  return (
    <SessionProvider>
      <FollowButtonStory />
    </SessionProvider>
  );
}

function RemoteFollowButtonStory() {
  const profile = requireProfile(useStoryProfiles(), 3);
  return <FollowButton profile={requireFragment(profile.followButton, 'follow button')} />;
}

function RemoteApprovalRequiredFollowButtonStory() {
  const profile = requireProfile(useStoryProfiles(), 10);
  return <FollowButton profile={requireFragment(profile.followButton, 'follow button')} />;
}

function PendingFollowButtonStory() {
  const profile = requireProfile(useStoryProfiles(), 11);
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
  beforeEach: () => {
    mocked(trackAnalytics).mockClear();
  },
  component: ProfileCatalog,
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'session-story', selectedProfile: { id: 'profile-viewer' } },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: storyProfiles,
      },
    },
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
    const canvas = within(canvasElement);
    const tagSection = within(
      canvas.getByText('Hero · tags empty / long / many / remote empty').parentElement!,
    );
    expect(tagSection.getByText('#Fediverse')).toBeVisible();
    expect(tagSection.getByText('#개발')).toBeVisible();
    expect(tagSection.getByText('#아주긴프로필태그이름입니다')).toBeVisible();
    expect(tagSection.getByText(`#${maxLengthProfileTag}`)).toBeVisible();
    expect(tagSection.getAllByTestId('profile-tag-list')).toHaveLength(2);

    const narrowFixture = tagSection.getByTestId('profile-tags-narrow-fixture');
    const narrowTagList = within(narrowFixture).getByTestId('profile-tag-list');
    const narrowChips = within(narrowTagList).getAllByTestId('profile-tag-chip');
    const maxLengthTagText = within(narrowTagList).getByText(`#${maxLengthProfileTag}`);
    const fixtureBounds = narrowFixture.getBoundingClientRect();
    const listBounds = narrowTagList.getBoundingClientRect();
    const maxLengthTagTextBounds = maxLengthTagText.getBoundingClientRect();

    expect(
      new Set(narrowChips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
    ).toBeGreaterThan(1);
    expect(listBounds.right).toBeLessThanOrEqual(fixtureBounds.right + 1);
    expect(narrowFixture.scrollWidth).toBeLessThanOrEqual(narrowFixture.clientWidth + 1);
    expect(narrowTagList.scrollWidth).toBeLessThanOrEqual(narrowTagList.clientWidth + 1);
    expect(maxLengthTagTextBounds.left).toBeGreaterThanOrEqual(listBounds.left - 1);
    expect(maxLengthTagTextBounds.right).toBeLessThanOrEqual(listBounds.right + 1);
    for (const chip of narrowChips) {
      const chipBounds = chip.getBoundingClientRect();
      expect(chipBounds.left).toBeGreaterThanOrEqual(listBounds.left - 1);
      expect(chipBounds.right).toBeLessThanOrEqual(listBounds.right + 1);
    }
  },
};

export const ListAndFollowStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followableSection = within(canvas.getByText('Followable').parentElement!);
    const followingSection = within(canvas.getByText('Following').parentElement!);
    expect(
      canvasElement.querySelector('a[href="/@remote-user@very-long-instance.example"]'),
    ).toBeInTheDocument();
    expect(canvas.getAllByRole('button', { name: '팔로우' })).toHaveLength(2);
    const followableAvatar = followableSection.getByLabelText('코스모 작가 프로필 이미지');
    const followingAvatar = followingSection.getByLabelText('코스모 작가 프로필 이미지');
    expect(followableAvatar.querySelector('img')).toHaveAttribute(
      'src',
      '/profile-followable-avatar.png',
    );
    expect(followingAvatar.querySelector('img')).toHaveAttribute(
      'src',
      '/profile-followed-avatar.png',
    );
    const fallbackAvatar = canvas.getByLabelText('이니셜 폴백 프로필 프로필 이미지');
    expect(fallbackAvatar.querySelector('img')?.getAttribute('src')).toMatch(
      /\/assets\/avatar\/default-avatar\.png$/,
    );
  },
  render: () => <ProfileListCatalog />,
};

export const FollowSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeDisabled();
    expect(canvas.queryByRole('button', { name: '처리 중' })).not.toBeInTheDocument();
  },
  render: () => <FollowButtonStory />,
};

export const FollowSuccessTracksAnalytics: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        followProfile: {
          followeeProfile: {
            ...followable,
            viewerState: {
              follow: {
                follower: { followingCount: 1, id: 'profile-viewer' },
                id: 'follow-story',
              },
              followRequest: null,
              isSelf: false,
            },
          },
          followerProfile: { followingCount: 1, id: 'profile-viewer' },
          result: { __typename: 'ProfileFollow', id: 'follow-story' },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    expect(trackAnalytics).toHaveBeenCalledOnce();
    expect(trackAnalytics).toHaveBeenCalledWith('follow_succeeded', {
      result: 'follow',
      selected_profile_id: 'profile-viewer',
    });
  },
  render: () => <AuthenticatedFollowButtonStory />,
};

export const FollowErrorInteraction: Story = {
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
  render: () => <AuthenticatedFollowButtonStory />,
};

export const RemoteFollowUsesSameActionSurface: Story = {
  play: ({ canvasElement }) => {
    expect(within(canvasElement).getByRole('button', { name: '팔로우' })).toBeVisible();
  },
  render: () => <RemoteFollowButtonStory />,
};

export const RemoteApprovalRequiredUsesSameActionSurface: Story = {
  play: ({ canvasElement }) => {
    expect(within(canvasElement).getByRole('button', { name: '팔로우' })).toBeVisible();
  },
  render: () => <RemoteApprovalRequiredFollowButtonStory />,
};

export const ApprovalRequiredFollowSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeDisabled();
  },
  render: () => <RemoteApprovalRequiredFollowButtonStory />,
};

export const ApprovalRequiredFollowErrorRollsBack: Story = {
  parameters: { relay: { mutationError: '요청 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
  },
  render: () => <RemoteApprovalRequiredFollowButtonStory />,
};

export const PendingCancelSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '요청됨' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeDisabled();
  },
  render: () => <PendingFollowButtonStory />,
};

export const PendingCancelErrorRollsBack: Story = {
  parameters: { relay: { mutationError: '취소 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '요청됨' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeEnabled();
  },
  render: () => <PendingFollowButtonStory />,
};

export const UnfollowKeepsConnectionRowAfterSuccess: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        unfollowProfile: {
          followeeProfile: {
            ...followed,
            followersCount: followed.followersCount - 1,
            viewerState: { follow: null, followRequest: null, isSelf: false },
          },
          followerProfile: {
            ...followingContent,
            followingCount: followingContent.followingCount - 1,
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
    expect(canvas.getByText('코스모 작가')).toBeVisible();
    expect(canvas.queryByText('아직 팔로잉이 없어요')).not.toBeInTheDocument();
  },
  render: () => <FollowingWithFollowedProfile />,
};

export const UnfollowKeepsCachedConnectionEdgeWhileSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeDisabled();
    expect(canvas.getByText('코스모 작가')).toBeVisible();
    expect(canvas.queryByText('아직 팔로잉이 없어요')).not.toBeInTheDocument();
  },
  render: () => <FollowingWithFollowedProfile />,
};

export const UnfollowErrorKeepsCachedConnectionEdge: Story = {
  parameters: { relay: { mutationError: '언팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
    expect(canvas.getByText('코스모 작가')).toBeVisible();
    expect(canvas.queryByText('아직 팔로잉이 없어요')).not.toBeInTheDocument();
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
