import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { ProfileSwitcher } from '@/components/shell/ProfileSwitcher';
import { RightRail } from '@/components/shell/RightRail';
import { SidebarNavigation } from '@/components/shell/SidebarNavigation';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { spacing } from '@/theme/tokens';
import { profile, shellQuery } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ShellStoriesQuery as ShellStoriesQueryType } from './__generated__/ShellStoriesQuery.graphql';

const secondProfile = profile({
  displayName: '먼 우주의 사용자',
  handle: 'remote',
  id: 'profile-remote',
  relativeHandle: '@remote@space.example',
  viewerState: { follow: null, isSelf: true },
});
const selectedProfile = profile({
  handle: 'selected',
  id: 'profile-selected',
  relativeHandle: '@selected',
  viewerState: { follow: null, isSelf: true },
});
const followedProfile = profile({
  followersCount: 17,
  handle: 'followed',
  id: 'profile-followed',
  relativeHandle: '@followed',
  viewerState: {
    follow: { follower: { id: selectedProfile.id }, id: 'profile-follow-edge' },
    isSelf: false,
  },
});
const query = {
  ...shellQuery({ profiles: [selectedProfile, secondProfile], selectedProfile }),
  node: followedProfile,
};

const ShellStoriesQuery = graphql`
  query ShellStoriesQuery {
    ...ProfileSwitcher_query
    ...SidebarNavigation_query
    currentSession {
      selectedProfile {
        ...BottomTabBar_profile
        ...RightRail_profile
      }
    }
    node(id: "profile-followed") {
      __typename
      ... on Profile {
        ...FollowButton_profile @alias(as: "followButton")
        ...ProfileHero_profile @alias(as: "hero")
      }
    }
  }
`;

function useShellStoryData() {
  const data = useLazyLoadQuery<ShellStoriesQueryType>(ShellStoriesQuery, {});
  const profile = data.currentSession?.selectedProfile;
  if (!profile) {
    throw new Error('ShellStoriesQuery requires a selected profile fixture.');
  }
  return { profile, query: data };
}

function NavigationCatalog() {
  const data = useShellStoryData();

  return (
    <Catalog width={760}>
      <Section title="Sidebar · full">
        <View style={{ height: 620 }}>
          <SidebarNavigation query={data.query} />
        </View>
      </Section>
      <Section title="Right rail">
        <View style={{ padding: spacing.lg, width: 320 }}>
          <RightRail profile={data.profile} />
        </View>
      </Section>
    </Catalog>
  );
}

function BottomNavigationStory() {
  return <BottomTabBar profile={useShellStoryData().profile} />;
}

function CompactSidebarStory() {
  return (
    <View style={{ height: 560, width: 80 }}>
      <SidebarNavigation compact query={useShellStoryData().query} />
    </View>
  );
}

function ProfileSwitcherStory() {
  return (
    <View style={{ maxWidth: 360 }}>
      <ProfileSwitcher query={useShellStoryData().query} showAvatar={false} />
    </View>
  );
}

function FollowCacheStory() {
  const data = useLazyLoadQuery<ShellStoriesQueryType>(ShellStoriesQuery, {});
  if (data.node?.__typename !== 'Profile' || !data.node.followButton || !data.node.hero) {
    throw new Error('FollowCacheStory requires the followed profile fixture.');
  }

  return (
    <Catalog width={760}>
      <Section title="Sidebar and followed profile">
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <View style={{ height: 620, width: 320 }}>
            <SidebarNavigation query={data} />
          </View>
          <View style={{ flex: 1 }}>
            <ProfileHero
              action={<FollowButton profile={data.node.followButton} />}
              profile={data.node.hero}
            />
          </View>
        </View>
      </Section>
    </Catalog>
  );
}

const meta = {
  component: NavigationCatalog,
  parameters: {
    relay: { data: query },
    router: { pathname: '/search' },
  },
  title: 'KOSMO/Shell/Navigation',
} satisfies Meta<typeof NavigationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SharedNavigation: Story = {};

export const BottomNavigation: Story = { render: () => <BottomNavigationStory /> };

export const CompactSidebar: Story = { render: () => <CompactSidebarStory /> };

export const FollowUpdatesBothProfileCounts: Story = {
  parameters: {
    relay: {
      data: {
        ...query,
        node: {
          ...followedProfile,
          followersCount: 16,
          viewerState: { follow: null, isSelf: false },
        },
      },
      mutationResponse: {
        followProfile: {
          followeeProfile: followedProfile,
          followerProfile: { ...selectedProfile, followingCount: 43 },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewerFollowing = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/following"]',
    );
    const targetFollowers = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@followed/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('16')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));

    await expect(within(viewerFollowing!).findByText('43')).resolves.toBeVisible();
    await expect(within(targetFollowers!).findByText('17')).resolves.toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const UnfollowUpdatesBothProfileCounts: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        unfollowProfile: {
          followeeProfile: {
            ...followedProfile,
            followersCount: 16,
            viewerState: { follow: null, isSelf: false },
          },
          followerProfile: { ...selectedProfile, followingCount: 41 },
          profileFollowId: 'profile-follow-edge',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewerFollowing = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/following"]',
    );
    const targetFollowers = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@followed/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('17')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));

    await expect(within(viewerFollowing!).findByText('41')).resolves.toBeVisible();
    await expect(within(targetFollowers!).findByText('16')).resolves.toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const ProfileSwitcherInteraction: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        selectProfile: {
          profile: secondProfile,
          session: { id: 'session-story', selectedProfile: { id: secondProfile.id } },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const menu = await canvas.findByRole('menu', { name: '프로필 전환' });

    expect(menu).toBeVisible();
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(2);
    expect(canvas.queryByText('프로필 전환')).not.toBeInTheDocument();
    expect(canvas.queryByRole('dialog', { name: '프로필 전환' })).not.toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: '새 프로필 추가' }));
    expect(canvas.getByRole('form', { name: '새 프로필 만들기' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const reopenedMenu = await canvas.findByRole('menu', { name: '프로필 전환' });
    expect(within(reopenedMenu).queryByRole('form', { name: '새 프로필 만들기' })).toBeNull();
    expect(within(reopenedMenu).getByRole('menuitem', { name: '새 프로필 추가' })).toBeVisible();
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherSelectGraphQLError: Story = {
  parameters: {
    relay: {
      mutationGraphQLErrors: ['프로필을 전환할 수 없습니다.'],
      mutationResponse: {
        selectProfile: {
          profile: query.currentSession.selectedProfile,
          session: { id: 'session-story', selectedProfile: query.currentSession.selectedProfile },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
    await userEvent.click(within(menu).getAllByRole('menuitemradio')[1]!);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '프로필을 전환하지 못했습니다.',
    );
    expect(menu).toBeVisible();
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherCreateGraphQLError: Story = {
  parameters: {
    relay: {
      mutationGraphQLErrors: ['이미 사용 중인 핸들입니다.'],
      mutationResponse: {
        createProfile: { account: query.me, profile: secondProfile },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: '새 프로필 추가' }));
    const input = canvas.getByRole('textbox', { name: '프로필 핸들' });
    await userEvent.type(input, 'kept_handle');
    await userEvent.click(canvas.getByRole('button', { name: '만들기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '프로필을 생성하지 못했습니다.',
    );
    expect(input).toHaveValue('kept_handle');
  },
  render: () => <ProfileSwitcherStory />,
};

const universalParameters = {
  layout: 'fullscreen',
  relay: { data: query },
  router: { pathname: '/home', slotLabel: '홈 타임라인' },
};

export const UniversalMobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 844 }}>
      <UniversalShell />
    </View>
  ),
};

export const UniversalCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 900 }}>
      <UniversalShell />
    </View>
  ),
};

export const UniversalFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: universalParameters,
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView;
    let rail: HTMLElement | null = within(canvasElement).getByRole('navigation', {
      name: '주요 메뉴',
    });

    while (rail && view?.getComputedStyle(rail).position !== 'sticky') {
      rail = rail.parentElement;
    }

    expect(rail).not.toBeNull();
    expect(rail?.getBoundingClientRect().height).toBeLessThanOrEqual(view?.innerHeight ?? 0);
  },
  render: () => (
    <View style={{ height: 1800 }}>
      <UniversalShell />
    </View>
  ),
};
