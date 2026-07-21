import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import { expect, userEvent, within } from 'storybook/test';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { ProfileSwitcher } from '@/components/shell/ProfileSwitcher';
import { RightRail } from '@/components/shell/RightRail';
import { SidebarNavigation } from '@/components/shell/SidebarNavigation';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
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

function UniversalShellStory() {
  return (
    <SessionProvider>
      <UniversalShell />
    </SessionProvider>
  );
}

function RemountableUniversalShellStory() {
  const [visible, setVisible] = useState(true);

  return (
    <>
      {visible ? <UniversalShellStory /> : null}
      <StoryButton
        label={visible ? '셸 숨기기' : '셸 다시 열기'}
        onPress={() => setVisible((current) => !current)}
      />
    </>
  );
}

function StoryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
}

function SetUnreadNotificationCount({ count }: { count: number }) {
  const environment = useRelayEnvironment();

  return (
    <StoryButton
      label={`읽지 않은 알림 수를 ${count}개로 변경`}
      onPress={() =>
        commitLocalUpdate(environment, (store) => {
          store.get(selectedProfile.id)?.setValue(count, 'unreadNotificationCount');
        })
      }
    />
  );
}

function RetryRelayActor() {
  const { retry } = useRelayActor();

  return <StoryButton label="기존 셸 새로고침" onPress={retry} />;
}

function ResetRelayActorToSecondProfile() {
  const { resetActor } = useRelayActor();

  return <StoryButton label="두 번째 프로필로 전환" onPress={() => resetActor(secondProfile.id)} />;
}

function unreadBadgeParameters(count: number) {
  return {
    ...universalParameters,
    relay: {
      data: query,
      operationResponses: {
        UnreadNotificationBadgeControllerQuery: {
          data: { node: { ...selectedProfile, unreadNotificationCount: count } },
        },
      },
    },
  };
}

export const UniversalMobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 844 }}>
      <UniversalShellStory />
    </View>
  ),
};

export const UniversalMobileUnreadBadge: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: unreadBadgeParameters(100),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 100개' }),
    ).resolves.toBeVisible();
    expect(canvas.getAllByRole('link', { name: '알림, 읽지 않은 알림 100개' })).toHaveLength(1);
    expect(canvas.queryByText('99+')).toBeNull();
    const bottomTabDot = canvas.getByTestId('unread-notification-dot');
    expect(bottomTabDot).toBeVisible();
    expect(bottomTabDot).toHaveStyle({ height: '8px', right: '2px', top: '-1px', width: '8px' });
    expect(bottomTabDot.closest('[aria-hidden="true"]')).not.toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '메뉴 열기' }));
    const page = within(canvasElement.ownerDocument.body);
    const drawerNavigation = await page.findByRole('navigation', { name: '주요 메뉴' });
    await expect(
      within(drawerNavigation).findByRole('link', { name: '알림, 읽지 않은 알림 100개' }),
    ).resolves.toBeVisible();
    expect(page.getAllByRole('link', { name: '알림, 읽지 않은 알림 100개' })).toHaveLength(1);
    const drawerDot = within(drawerNavigation).getByTestId('unread-notification-dot');
    expect(drawerDot).toBeVisible();
    expect(drawerDot).toHaveStyle({ height: '8px', right: '2px', top: '-1px', width: '8px' });
    expect(within(drawerNavigation).queryByText('99+')).toBeNull();
  },
  render: () => (
    <View style={{ height: 844 }}>
      <UniversalShellStory />
    </View>
  ),
};

export const UniversalMobileUnreadBadgeZero: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: unreadBadgeParameters(0),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notification = await canvas.findByRole('link', { name: '알림' });
    expect(notification).toBeVisible();
    expect(canvas.queryByTestId('unread-notification-dot')).toBeNull();
  },
  render: () => <UniversalShellStory />,
};

export const UniversalMobileUnreadBadgeInitialFailure: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    ...universalParameters,
    relay: {
      data: query,
      operationResponses: {
        UnreadNotificationBadgeControllerQuery: {
          error: '읽지 않은 알림 수를 불러오지 못했습니다.',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notification = await canvas.findByRole('link', { name: '알림' });
    expect(notification).toBeVisible();
    expect(canvas.queryByTestId('unread-notification-dot')).toBeNull();
    expect(canvas.queryByText('읽지 않은 알림 수를 불러오지 못했습니다.')).toBeNull();
    expect(canvas.queryByRole('button', { name: /알림.*(재시도|다시)/ })).toBeNull();
  },
  render: () => <UniversalShellStory />,
};

export const UniversalCompactUnreadBadge: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: unreadBadgeParameters(99),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 99개' }),
    ).resolves.toBeVisible();
    expect(canvas.queryByText('99')).toBeNull();
    expect(canvas.getByTestId('unread-notification-dot')).toHaveStyle({
      height: '8px',
      right: '2px',
      top: '-1px',
      width: '8px',
    });
  },
  render: () => <UniversalShellStory />,
};

export const UniversalFullUnreadBadge: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: unreadBadgeParameters(1),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 1개' }),
    ).resolves.toBeVisible();
    expect(canvas.queryByText('1')).toBeNull();
    expect(canvas.getByTestId('unread-notification-dot')).toHaveStyle({
      height: '8px',
      right: '2px',
      top: '-1px',
      width: '8px',
    });
  },
  render: () => <UniversalShellStory />,
};

export const UnreadBadgeUsesNormalizedRelayProfileRecord: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: unreadBadgeParameters(7),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 7개' }),
    ).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '읽지 않은 알림 수를 100개로 변경' }));
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 100개' }),
    ).resolves.toBeVisible();
    expect(canvas.queryByText('99+')).toBeNull();
    expect(canvas.getByTestId('unread-notification-dot')).toBeVisible();
  },
  render: () => (
    <>
      <UniversalShellStory />
      <SetUnreadNotificationCount count={100} />
    </>
  ),
};

export const UnreadBadgeRestoresWarmCacheAfterShellRemount: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: unreadBadgeParameters(7),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 7개' }),
    ).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '셸 숨기기' }));
    expect(canvas.queryByRole('link', { name: '알림, 읽지 않은 알림 7개' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '셸 다시 열기' }));
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 7개' }),
    ).resolves.toBeVisible();
  },
  render: () => <RemountableUniversalShellStory />,
};

export const UnreadBadgeKeepsSameProfileCountAcrossFailedRefresh: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    ...universalParameters,
    relay: {
      data: query,
      operationResponses: {
        UnreadNotificationBadgeControllerQuery: [
          { data: { node: { ...selectedProfile, unreadNotificationCount: 7 } } },
          { error: '읽지 않은 알림 수를 불러오지 못했습니다.' },
          { data: { node: { ...selectedProfile, unreadNotificationCount: 9 } } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 7개' }),
    ).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '기존 셸 새로고침' }));
    await expect(
      page.findByRole('link', { name: '알림, 읽지 않은 알림 7개' }),
    ).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: /알림.*다시/ })).toBeNull();
    expect(page.queryByText('읽지 않은 알림 수를 불러오지 못했습니다.')).toBeNull();
    await userEvent.click(page.getByRole('button', { name: '기존 셸 새로고침' }));
    await expect(
      page.findByRole('link', { name: '알림, 읽지 않은 알림 9개' }),
    ).resolves.toBeVisible();
  },
  render: () => (
    <>
      <UniversalShellStory />
      <RetryRelayActor />
    </>
  ),
};

const transitionedQuery = {
  ...query,
  currentSession: { ...query.currentSession, selectedProfile: secondProfile },
  me: { ...query.me, profiles: [selectedProfile, secondProfile] },
};

export const UnreadBadgeHidesPreviousProfileCountUntilNextRetry: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    ...universalParameters,
    relay: {
      data: query,
      operationResponses: {
        SessionProviderQuery: [
          { data: query },
          { data: transitionedQuery },
          { data: transitionedQuery },
        ],
        UniversalShellQuery: [
          { data: query },
          { data: transitionedQuery },
          { data: transitionedQuery },
        ],
        UnreadNotificationBadgeControllerQuery: [
          { data: { node: { ...selectedProfile, unreadNotificationCount: 7 } } },
          { error: '두 번째 프로필의 읽지 않은 알림 수를 불러오지 못했습니다.' },
          { data: { node: { ...secondProfile, unreadNotificationCount: 4 } } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.findByRole('link', { name: '알림, 읽지 않은 알림 7개' }),
    ).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '두 번째 프로필로 전환' }));
    await expect(page.findByRole('link', { name: '알림' })).resolves.toBeVisible();
    expect(page.queryByRole('link', { name: '알림, 읽지 않은 알림 7개' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: '기존 셸 새로고침' }));
    await expect(
      page.findByRole('link', { name: '알림, 읽지 않은 알림 4개' }),
    ).resolves.toBeVisible();
  },
  render: () => (
    <>
      <UniversalShellStory />
      <ResetRelayActorToSecondProfile />
      <RetryRelayActor />
    </>
  ),
};

export const UniversalCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 900 }}>
      <UniversalShellStory />
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
      <UniversalShellStory />
    </View>
  ),
};
