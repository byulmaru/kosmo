import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import { expect, mocked, userEvent, waitFor, within } from 'storybook/test';
import { trackAnalytics } from '@/analytics/client';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from '@/components/shell/NavigationGuardContext';
import { ProfileSwitcher } from '@/components/shell/ProfileSwitcher';
import { RightRail, RightRailPrivacyLink } from '@/components/shell/RightRail';
import { SidebarNavigation } from '@/components/shell/SidebarNavigation';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { spacing } from '@/theme/tokens';
import { profile, shellQuery } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GuardedNavigationAction } from '@/components/shell/NavigationGuardContext';
import type { ShellStoriesQuery as ShellStoriesQueryType } from './__generated__/ShellStoriesQuery.graphql';

const selectedAvatarUrl = '/apple-touch-icon.png';
const selectedHeaderUrl = '/og-default.png';
const secondAvatarUrl = '/icon-192.png';
const secondProfile = profile({
  avatar: { id: 'media-shell-second-avatar', url: secondAvatarUrl },
  displayName: '먼 우주의 사용자',
  handle: 'remote',
  id: 'profile-remote',
  relativeHandle: '@remote@space.example',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});
const selectedProfile = profile({
  avatar: { id: 'media-shell-selected-avatar', url: selectedAvatarUrl },
  header: { id: 'media-shell-selected-header', url: selectedHeaderUrl },
  handle: 'selected',
  id: 'profile-selected',
  relativeHandle: '@selected',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});
const followedProfile = profile({
  followersCount: 17,
  handle: 'followed',
  id: 'profile-followed',
  instance: { kind: 'ACTIVITYPUB' },
  relativeHandle: '@followed@remote.example',
  viewerState: {
    follow: {
      follower: { followingCount: selectedProfile.followingCount, id: selectedProfile.id },
      id: 'profile-follow-edge',
    },
    followRequest: null,
    isSelf: false,
  },
});
const query = {
  ...shellQuery({ profiles: [selectedProfile, secondProfile], selectedProfile }),
  node: followedProfile,
};
const additionalProfiles = Array.from({ length: 11 }, (_, index) =>
  profile({
    displayName: `테스트 프로필 ${index + 1}`,
    handle: `picker_${index + 1}`,
    id: `profile-picker-${index + 1}`,
    relativeHandle: `@picker_${index + 1}`,
    viewerState: { follow: null, followRequest: null, isSelf: true },
  }),
);
const longProfileQuery = {
  ...query,
  ...shellQuery({ profiles: [selectedProfile, ...additionalProfiles], selectedProfile }),
};
const imagePresentationQuery = {
  ...query,
  ...shellQuery({
    profiles: [
      selectedProfile,
      secondProfile,
      profile({
        displayName: '이미지 없는 프로필',
        handle: 'fallback',
        id: 'profile-fallback',
        relativeHandle: '@fallback',
        viewerState: { follow: null, followRequest: null, isSelf: true },
      }),
    ],
    selectedProfile,
  }),
};
const selectedProfileWithoutHeader = { ...selectedProfile, header: null };
const headerFallbackQuery = {
  ...query,
  ...shellQuery({
    profiles: [selectedProfileWithoutHeader, secondProfile],
    selectedProfile: selectedProfileWithoutHeader,
  }),
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
        <View style={{ height: 560, padding: spacing.lg, width: 320 }}>
          <RightRail profile={data.profile} />
          <RightRailPrivacyLink />
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

function FeedbackNavigationFullStory() {
  return (
    <View style={{ height: 560, width: 320 }}>
      <SidebarNavigation query={useShellStoryData().query} />
    </View>
  );
}

function FeedbackNavigationDrawerStory() {
  return (
    <View style={{ height: 560, width: 320 }}>
      <SidebarNavigation query={useShellStoryData().query} surface="drawer" />
    </View>
  );
}

function ProfileSwitcherStory() {
  return (
    <View style={{ maxWidth: 360 }}>
      <ProfileSwitcher query={useShellStoryData().query} surface="full" />
    </View>
  );
}

function NavigationGuardRegistrar({
  onPending,
}: {
  onPending: (action: GuardedNavigationAction) => void;
}) {
  const { register } = useNavigationGuard();
  useEffect(
    () =>
      register((action) => {
        onPending(action);
        return true;
      }),
    [onPending, register],
  );
  return null;
}

function GuardedProfileSwitcherStory() {
  const [pending, setPending] = useState<GuardedNavigationAction | null>(null);
  return (
    <NavigationGuardProvider>
      <NavigationGuardRegistrar onPending={(action) => setPending(() => action)} />
      <ProfileSwitcherStory />
      <Pressable
        accessibilityRole="button"
        disabled={!pending}
        onPress={() => {
          const action = pending;
          setPending(null);
          action?.();
        }}
      >
        <Text>버리기</Text>
      </Pressable>
    </NavigationGuardProvider>
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
  beforeEach: () => {
    mocked(trackAnalytics).mockClear();
  },
  component: NavigationCatalog,
  parameters: {
    relay: { data: query },
    router: { pathname: '/search' },
  },
  title: 'KOSMO/Shell/Navigation',
} satisfies Meta<typeof NavigationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SharedNavigation: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('link', { name: '북마크' })).toHaveAttribute('href', '/bookmarks');
    expect(canvas.getByRole('link', { name: '프로필' })).toHaveAttribute('href', '/@selected');
    expect(canvas.queryByRole('link', { name: '팔로워 요청' })).not.toBeInTheDocument();
    expect(canvas.getByRole('link', { name: '피드백 보내기' })).toHaveAttribute(
      'href',
      '/feedback',
    );
    expect(canvas.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: '로그아웃' }).querySelector('svg')).toHaveAttribute(
      'stroke-width',
      '2',
    );
    expect(canvas.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(canvas.queryByRole('link', { name: '프로필 설정' })).not.toBeInTheDocument();
  },
};

export const BottomNavigation: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getByLabelText(`${selectedProfile.displayName} 프로필 이미지`);
    expect(canvas.getByRole('link', { name: '글쓰기' })).toHaveAttribute('href', '/compose');
    expect(avatar.querySelector('img')).toHaveAttribute('src', selectedAvatarUrl);
  },
  render: () => <BottomNavigationStory />,
};

export const CompactSidebar: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('link', { name: '북마크' })).toHaveAttribute('href', '/bookmarks');
    expect(canvas.getByRole('link', { name: '프로필' })).toHaveAttribute('href', '/@selected');
    expect(canvas.queryByRole('link', { name: '팔로워 요청' })).not.toBeInTheDocument();
    expect(canvas.getByRole('link', { name: '피드백 보내기' })).toHaveAttribute(
      'href',
      '/feedback',
    );
    const logout = canvas.getByRole('button', { name: '로그아웃' });
    const feedback = canvas.getByRole('link', { name: '피드백 보내기' });
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });
    const avatar = canvas.getByLabelText('코스모 작가 프로필 이미지');
    const triggerRect = trigger.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    const logoutRect = logout.getBoundingClientRect();
    const feedbackRect = feedback.getBoundingClientRect();

    expect(logout).toBeInTheDocument();
    expect(logout.querySelector('svg')).toHaveAttribute('stroke-width', '2');
    expect(avatarRect.x + avatarRect.width / 2).toBeCloseTo(
      feedbackRect.x + feedbackRect.width / 2,
      0,
    );
    expect(triggerRect.x + triggerRect.width / 2).toBeCloseTo(
      feedbackRect.x + feedbackRect.width / 2,
      0,
    );
    expect(feedback.querySelector('svg')).toHaveAttribute('stroke-width', '2');
    expect(logoutRect.x + logoutRect.width / 2).toBeCloseTo(
      feedbackRect.x + feedbackRect.width / 2,
      0,
    );
    expect(canvas.getByRole('link', { name: '글쓰기' })).toHaveAttribute('href', '/compose');
    expect(canvas.queryByRole('link', { name: '개인정보 처리방침' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('link', { name: '프로필 설정' })).not.toBeInTheDocument();
  },
  render: () => <CompactSidebarStory />,
};

export const FeedbackNavigationCurrentState: Story = {
  parameters: { router: { pathname: '/feedback' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: '피드백 보내기' });
    const logout = canvas.getByRole('button', { name: '로그아웃' });
    const feedbackLabel = within(link).getByText('피드백 보내기');
    const logoutLabel = within(logout).getByText('로그아웃');
    expect(link).toHaveAttribute('href', '/feedback');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    expect(link.nextElementSibling).toContainElement(logout);
    expect(link.parentElement).toHaveStyle({ borderTopWidth: '1px' });
    expect(feedbackLabel).toHaveStyle({ fontSize: '14px', lineHeight: '21px' });
    expect(logoutLabel).toHaveStyle({ fontSize: '14px', lineHeight: '21px' });
    expect(link.querySelector('svg')).toHaveAttribute('height', '20');
    expect(link.querySelector('svg')).toHaveAttribute('width', '20');
    expect(logout.querySelector('svg')).toHaveAttribute('height', '20');
    expect(logout.querySelector('svg')).toHaveAttribute('width', '20');
    expect(link.querySelector('path')).toHaveAttribute(
      'd',
      'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7',
    );
  },
  render: () => <FeedbackNavigationFullStory />,
};

export const FeedbackNavigationCompactCurrentState: Story = {
  parameters: { router: { pathname: '/feedback' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: '피드백 보내기' });
    const logout = canvas.getByRole('button', { name: '로그아웃' });
    expect(link).toHaveAttribute('href', '/feedback');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    expect(link.nextElementSibling).toContainElement(logout);
    expect(link.parentElement).toHaveStyle({ borderTopWidth: '0px' });
  },
  render: () => <CompactSidebarStory />,
};

export const FeedbackNavigationDrawerCurrentState: Story = {
  parameters: { router: { pathname: '/feedback' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: '피드백 보내기' });
    const logout = canvas.getByRole('button', { name: '로그아웃' });
    expect(link).toHaveAttribute('href', '/feedback');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    expect(link.nextElementSibling).toContainElement(logout);
    expect(link.parentElement).toHaveStyle({ borderTopWidth: '1px' });
    expect(canvas.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('link', { name: '개인정보 처리방침' })).not.toBeInTheDocument();
    expect(logout.querySelector('svg')).toHaveAttribute('stroke-width', '2');
  },
  render: () => <FeedbackNavigationDrawerStory />,
};

export const ResponsiveProfilePickerFull: Story = {
  parameters: {
    relay: { data: longProfileQuery },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });
    const navigation = canvas.getByRole('navigation', { name: '주요 메뉴' });
    const triggerName = within(trigger).getByText('코스모 작가');
    const profileHandle = canvas.getByLabelText('활성 프로필 핸들');
    const triggerIcon = trigger.querySelector('svg')!;
    const triggerRect = trigger.getBoundingClientRect();
    const closedNavigationTop = navigation.getBoundingClientRect().top;
    const nameRect = triggerName.getBoundingClientRect();
    const handleRect = profileHandle.getBoundingClientRect();
    const iconRect = triggerIcon.getBoundingClientRect();

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      nameRect.top + nameRect.height / 2 - (triggerRect.top + triggerRect.height / 2),
    ).toBeCloseTo(0, 0);
    expect(
      iconRect.top + iconRect.height / 2 - (triggerRect.top + triggerRect.height / 2),
    ).toBeCloseTo(0, 0);
    expect(handleRect.top - nameRect.bottom).toBeGreaterThanOrEqual(-8);
    expect(handleRect.top - nameRect.bottom).toBeLessThanOrEqual(2);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const pickerRegion = await canvas.findByLabelText('프로필 전환');
    const picker = pickerRegion.parentElement;
    const list = canvas.getByLabelText('전환할 프로필 목록');
    const options = within(list).getAllByRole('button');
    const footerAction = canvas.getByRole('button', { name: '새 프로필 추가' });
    const pickerRect = pickerRegion.getBoundingClientRect();
    const openTriggerRect = trigger.getBoundingClientRect();
    const openNavigationTop = navigation.getBoundingClientRect().top;
    const followingLink = canvas.getByRole('link', { name: /팔로잉/ });

    expect(pickerRegion).toBeVisible();
    expect(picker).not.toBeNull();
    expect(picker!.getBoundingClientRect().height).toBeLessThanOrEqual(430);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(footerAction).toBeVisible();
    expect(pickerRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
    expect(pickerRect.top - triggerRect.bottom).toBeLessThanOrEqual(12);
    expect(openTriggerRect).toEqual(triggerRect);
    expect(openNavigationTop).toBe(closedNavigationTop);
    expect(pickerRect.bottom).toBeGreaterThan(openNavigationTop);
    expect(canvas.queryByRole('dialog')).toBeNull();
    expect(options).toHaveLength(12);
    expect(trigger).toHaveFocus();

    for (const option of options) {
      await userEvent.tab();
      expect(option).toHaveFocus();
    }
    const listRect = list.getBoundingClientRect();
    const focusedRect = options.at(-1)!.getBoundingClientRect();
    expect(focusedRect.top).toBeGreaterThanOrEqual(listRect.top);
    expect(focusedRect.bottom).toBeLessThanOrEqual(listRect.bottom);
    await userEvent.tab();
    expect(footerAction).toHaveFocus();
    await userEvent.tab();
    expect(followingLink).toHaveFocus();
    await waitFor(() => expect(canvas.queryByLabelText('프로필 전환')).toBeNull());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(followingLink).toHaveFocus();

    await userEvent.click(trigger);
    await canvas.findByLabelText('프로필 전환');
    await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
    const handle = canvas.getByRole('textbox', { name: '프로필 핸들' });
    await userEvent.type(handle, 'outside_reset');
    expect(handle).toHaveValue('outside_reset');

    const feedbackLink = canvas.getByRole('link', { name: '피드백 보내기' });
    feedbackLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await userEvent.click(feedbackLink);
    await waitFor(() => expect(canvas.queryByLabelText('프로필 전환')).toBeNull());
    expect(feedbackLink).toHaveFocus();

    await userEvent.click(trigger);
    await waitFor(() => {
      expect(canvas.queryByRole('form', { name: '새 프로필 만들기' })).toBeNull();
      expect(canvas.queryByRole('alert')).toBeNull();
    });
    await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
    expect(canvas.getByRole('textbox', { name: '프로필 핸들' })).toHaveValue('');

    followingLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await userEvent.click(followingLink);
    await waitFor(() => expect(canvas.queryByLabelText('프로필 전환')).toBeNull());

    await userEvent.click(trigger);
    await canvas.findByLabelText('프로필 전환');
    const followersLink = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/followers"]',
    );
    expect(followersLink).not.toBeNull();
    followersLink!.addEventListener('click', (event) => event.preventDefault(), { once: true });
    followersLink!.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.queryByLabelText('프로필 전환')).toBeNull());
  },
  render: () => (
    <View style={{ height: 900, width: 320 }}>
      <SidebarNavigation query={useShellStoryData().query} />
    </View>
  ),
};

export const FollowUpdatesBothProfileCounts: Story = {
  parameters: {
    relay: {
      data: {
        ...query,
        node: {
          ...followedProfile,
          followersCount: 16,
          viewerState: { follow: null, followRequest: null, isSelf: false },
        },
      },
      mutationResponse: {
        followProfile: {
          result: { __typename: 'ProfileFollow', id: 'profile-follow-edge' },
          followeeProfile: {
            ...followedProfile,
            viewerState: {
              follow: {
                follower: { followingCount: 43, id: selectedProfile.id },
                id: 'profile-follow-edge',
              },
              followRequest: null,
              isSelf: false,
            },
          },
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
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('16')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));

    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeVisible();
    await expect(within(viewerFollowing!).findByText('43')).resolves.toBeVisible();
    await expect(within(targetFollowers!).findByText('17')).resolves.toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const FollowOptimisticallyUpdatesBothProfileCounts: Story = {
  parameters: {
    relay: {
      data: {
        ...query,
        node: {
          ...followedProfile,
          followersCount: 16,
          viewerState: { follow: null, followRequest: null, isSelf: false },
        },
      },
      mutationLoading: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewerFollowing = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/following"]',
    );
    const targetFollowers = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));

    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeDisabled();
    await expect(within(viewerFollowing!).findByText('43')).resolves.toBeVisible();
    await expect(within(targetFollowers!).findByText('17')).resolves.toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const ApprovalRequiredFollowKeepsProfileCounts: Story = {
  parameters: {
    relay: {
      data: {
        ...query,
        node: {
          ...followedProfile,
          followPolicy: 'APPROVAL_REQUIRED',
          followersCount: 16,
          viewerState: { follow: null, followRequest: null, isSelf: false },
        },
      },
      mutationResponse: {
        followProfile: {
          result: { __typename: 'ProfileFollowRequest', id: 'profile-follow-request' },
          followeeProfile: {
            ...followedProfile,
            followPolicy: 'APPROVAL_REQUIRED',
            followersCount: 16,
            viewerState: {
              follow: null,
              followRequest: { id: 'profile-follow-request' },
              isSelf: false,
            },
          },
          followerProfile: selectedProfile,
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
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));

    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeVisible();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('16')).toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const PendingCancelKeepsProfileCounts: Story = {
  parameters: {
    relay: {
      data: {
        ...query,
        node: {
          ...followedProfile,
          followPolicy: 'APPROVAL_REQUIRED',
          followersCount: 16,
          viewerState: {
            follow: null,
            followRequest: { id: 'profile-follow-request' },
            isSelf: false,
          },
        },
      },
      mutationResponse: {
        cancelProfileFollowRequest: { profileFollowRequestId: 'profile-follow-request' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewerFollowing = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/following"]',
    );
    const targetFollowers = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '요청됨' }));

    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeVisible();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('16')).toBeVisible();
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
            viewerState: { follow: null, followRequest: null, isSelf: false },
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
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('17')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));

    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeVisible();
    await expect(within(viewerFollowing!).findByText('41')).resolves.toBeVisible();
    await expect(within(targetFollowers!).findByText('16')).resolves.toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const UnfollowOptimisticallyUpdatesBothProfileCounts: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewerFollowing = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/following"]',
    );
    const targetFollowers = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));

    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeDisabled();
    await expect(within(viewerFollowing!).findByText('41')).resolves.toBeVisible();
    await expect(within(targetFollowers!).findByText('16')).resolves.toBeVisible();
  },
  render: () => <FollowCacheStory />,
};

export const UnfollowErrorRollsBackBothProfileCounts: Story = {
  parameters: { relay: { mutationError: '언팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewerFollowing = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@selected/following"]',
    );
    const targetFollowers = canvasElement.querySelector<HTMLAnchorElement>(
      'a[href="/@followed@remote.example/followers"]',
    );
    expect(viewerFollowing).not.toBeNull();
    expect(targetFollowers).not.toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '팔로잉' }));

    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
    expect(within(viewerFollowing!).getByText('42')).toBeVisible();
    expect(within(targetFollowers!).getByText('17')).toBeVisible();
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
    const pickerRegion = await canvas.findByLabelText('프로필 전환');
    const list = canvas.getByLabelText('전환할 프로필 목록');

    expect(pickerRegion).toBeVisible();
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(canvas.queryByText('프로필 전환')).not.toBeInTheDocument();
    expect(canvas.queryByRole('dialog', { name: '프로필 전환' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
    expect(canvas.getByRole('form', { name: '새 프로필 만들기' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const reopenedPicker = await canvas.findByLabelText('프로필 전환');
    expect(within(reopenedPicker).queryByRole('form', { name: '새 프로필 만들기' })).toBeNull();
    expect(canvas.getByRole('button', { name: '새 프로필 추가' })).toBeVisible();
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherImagePresentation: Story = {
  parameters: { relay: { data: imagePresentationQuery } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const activeAvatar = canvas.getByLabelText(`${selectedProfile.displayName} 프로필 이미지`);
    await waitFor(() =>
      expect(activeAvatar.querySelector('img')).toHaveAttribute('src', selectedAvatarUrl),
    );
    const headerImage = await waitFor(() => {
      const image = canvasElement.querySelector<HTMLImageElement>(
        `img[src="${selectedHeaderUrl}"]`,
      );
      expect(image).toBeInTheDocument();
      return image!;
    });
    const activeSurface = canvas.getByLabelText('활성 프로필');
    const cover = activeSurface.firstElementChild as HTMLElement;
    expect(cover.contains(headerImage)).toBe(true);
    expect(getComputedStyle(cover).filter).toBe('none');

    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const list = await canvas.findByLabelText('전환할 프로필 목록');
    const options = within(list).getAllByRole('button');
    expect(options).toHaveLength(3);

    const secondAvatar = within(options[1]!).getByLabelText(
      `${secondProfile.displayName} 프로필 이미지`,
    );
    await waitFor(() =>
      expect(secondAvatar.querySelector('img')).toHaveAttribute('src', secondAvatarUrl),
    );

    const fallbackAvatar = within(options[2]!).getByLabelText('이미지 없는 프로필 프로필 이미지');
    expect(fallbackAvatar.querySelector('img')?.getAttribute('src')).toMatch(
      /\/assets\/avatar\/default-avatar\.png$/,
    );
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherHeaderFallbackPresentation: Story = {
  parameters: { relay: { data: headerFallbackQuery } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const activeSurface = canvas.getByLabelText('활성 프로필');
    const cover = activeSurface.firstElementChild as HTMLElement;

    expect(canvasElement.querySelector(`img[src="${selectedHeaderUrl}"]`)).not.toBeInTheDocument();
    expect(getComputedStyle(cover).backgroundImage).toContain('linear-gradient');
    expect(getComputedStyle(cover).filter).toBe('blur(1px)');
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherSelectTracksAnalytics: Story = {
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
    const list = await canvas.findByLabelText('전환할 프로필 목록');
    await userEvent.click(within(list).getAllByRole('button')[1]!);
    expect(trackAnalytics).toHaveBeenCalledOnce();
    expect(trackAnalytics).toHaveBeenCalledWith('profile_selected', {
      selected_profile_id: secondProfile.id,
    });
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherApprovedSelectRunsOnce: Story = {
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
    const list = await canvas.findByLabelText('전환할 프로필 목록');
    await userEvent.click(within(list).getAllByRole('button')[1]!);
    expect(trackAnalytics).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button', { name: '버리기' }));
    await waitFor(() =>
      expect(trackAnalytics).toHaveBeenCalledWith('profile_selected', {
        selected_profile_id: secondProfile.id,
      }),
    );
  },
  render: () => <GuardedProfileSwitcherStory />,
};

export const ProfileSwitcherCreateTracksAnalytics: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileSwitcherCreateProfileMutation: {
          data: {
            createProfile: {
              account: { ...query.me, profiles: [...query.me.profiles, secondProfile] },
              profile: secondProfile,
            },
          },
        },
        ProfileSwitcherSelectProfileMutation: {
          data: {
            selectProfile: {
              profile: secondProfile,
              session: { id: 'session-story', selectedProfile: { id: secondProfile.id } },
            },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    await canvas.findByLabelText('프로필 전환');
    await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
    await userEvent.type(canvas.getByRole('textbox', { name: '프로필 핸들' }), 'new_profile');
    await userEvent.click(canvas.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(trackAnalytics).toHaveBeenCalledTimes(2));
    expect(trackAnalytics).toHaveBeenNthCalledWith(1, 'profile_created', {
      selected_profile_id: selectedProfile.id,
    });
    expect(trackAnalytics).toHaveBeenNthCalledWith(2, 'profile_selected', {
      selected_profile_id: secondProfile.id,
    });
  },
  render: () => <ProfileSwitcherStory />,
};

export const ProfileSwitcherLateErrorAfterDismissal: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileSwitcherSelectProfileMutation: {
          delayMs: 100,
          error: '지연된 프로필 전환 실패',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });
    await userEvent.click(trigger);
    await canvas.findByLabelText('프로필 전환');
    const list = canvas.getByLabelText('전환할 프로필 목록');
    await userEvent.click(within(list).getAllByRole('button')[1]!);
    await userEvent.click(trigger);
    const responseDeadline = Date.now() + 120;
    await waitFor(() => expect(Date.now()).toBeGreaterThanOrEqual(responseDeadline));

    await userEvent.click(trigger);
    await canvas.findByLabelText('프로필 전환');
    expect(canvas.queryByRole('alert')).toBeNull();
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
    const pickerRegion = await canvas.findByLabelText('프로필 전환');
    const list = canvas.getByLabelText('전환할 프로필 목록');
    await userEvent.click(within(list).getAllByRole('button')[1]!);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '프로필을 전환하지 못했습니다.',
    );
    expect(pickerRegion).toBeVisible();
    expect(trackAnalytics).not.toHaveBeenCalled();
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
    await canvas.findByLabelText('프로필 전환');
    await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
    const input = canvas.getByRole('textbox', { name: '프로필 핸들' });
    await userEvent.type(input, 'kept_handle');
    await userEvent.click(canvas.getByRole('button', { name: '만들기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '프로필을 생성하지 못했습니다.',
    );
    expect(input).toHaveValue('kept_handle');
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    expect(canvas.queryByRole('alert')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
    expect(canvas.getByRole('textbox', { name: '프로필 핸들' })).toHaveValue('');
    expect(trackAnalytics).not.toHaveBeenCalled();
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const homeHeading = canvas.getByRole('heading', { name: '홈' });
    const menuButton = canvas.getByRole('button', { name: '메뉴 열기' });
    const homeHeader = homeHeading.parentElement?.parentElement;
    const brandMark = homeHeader?.querySelector<HTMLImageElement>('img');
    const trailingSlot = homeHeader?.querySelector<HTMLElement>(
      '[data-testid="page-header-trailing-slot"]',
    );

    expect(homeHeader).not.toBeNull();
    expect(homeHeader).toContainElement(menuButton);
    expect(brandMark).not.toBeNull();
    expect(trailingSlot).not.toBeNull();
    expect(trailingSlot?.getBoundingClientRect().height).toBe(44);
    expect(trailingSlot?.getBoundingClientRect().width).toBe(44);
    expect(
      brandMark!.getBoundingClientRect().left + brandMark!.getBoundingClientRect().width / 2,
    ).toBeCloseTo(
      homeHeader!.getBoundingClientRect().left + homeHeader!.getBoundingClientRect().width / 2,
      0,
    );
    expect(within(menuButton).queryByText('메뉴')).toBeNull();
    expect(getComputedStyle(menuButton).borderTopWidth).toBe('0px');
    expect(menuButton.getBoundingClientRect().height).toBe(44);
    expect(menuButton.getBoundingClientRect().width).toBe(44);
    expect(canvas.getAllByRole('heading', { name: '홈' })).toHaveLength(1);
    expect(canvas.queryByRole('link', { name: '북마크' })).not.toBeInTheDocument();
    await userEvent.click(menuButton);
    const page = within(canvasElement.ownerDocument.body);
    const drawer = await page.findByRole('navigation', { name: '주요 메뉴' });
    const profileTrigger = page.getByRole('button', { name: '프로필 목록' });
    const triggerName = within(profileTrigger).getByText('코스모 작가');
    const profileHandle = page.getByLabelText('활성 프로필 핸들');
    const triggerIcon = profileTrigger.querySelector('svg')!;
    const triggerRect = profileTrigger.getBoundingClientRect();
    const navigationRect = drawer.getBoundingClientRect();
    const nameRect = triggerName.getBoundingClientRect();
    const handleRect = profileHandle.getBoundingClientRect();
    const iconRect = triggerIcon.getBoundingClientRect();

    expect(within(drawer).getByRole('link', { name: '북마크' })).toHaveAttribute(
      'href',
      '/bookmarks',
    );
    expect(within(drawer).getByRole('link', { name: '프로필' })).toHaveAttribute(
      'href',
      '/@selected',
    );
    expect(within(drawer).queryByRole('link', { name: '팔로워 요청' })).not.toBeInTheDocument();
    const feedback = page.getByRole('link', { name: '피드백 보내기' });
    expect(feedback).toHaveAttribute('href', '/feedback');
    expect(within(drawer).queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument();
    expect(page.queryByRole('link', { name: '개인정보 처리방침' })).not.toBeInTheDocument();
    const logout = page.getByRole('button', { name: '로그아웃' });
    expect(logout).toBeInTheDocument();
    expect(logout.querySelector('svg')).toHaveAttribute('stroke-width', '2');
    expect(within(drawer).queryByRole('link', { name: '프로필 설정' })).not.toBeInTheDocument();
    const profileSummary = page.getByLabelText('활성 프로필');
    expect(profileSummary).toBeInTheDocument();
    expect(within(profileSummary).getByRole('link', { name: /팔로잉/ })).toHaveAttribute(
      'href',
      '/@selected/following',
    );
    expect(within(profileSummary).getByRole('link', { name: /팔로워/ })).toHaveAttribute(
      'href',
      '/@selected/followers',
    );
    expect(triggerIcon.querySelector('path')).toHaveAttribute('d', 'm6 9 6 6 6-6');
    expect(
      nameRect.top + nameRect.height / 2 - (triggerRect.top + triggerRect.height / 2),
    ).toBeCloseTo(0, 0);
    expect(
      iconRect.top + iconRect.height / 2 - (triggerRect.top + triggerRect.height / 2),
    ).toBeCloseTo(0, 0);
    expect(handleRect.top - nameRect.bottom).toBeGreaterThanOrEqual(-8);
    expect(handleRect.top - nameRect.bottom).toBeLessThanOrEqual(2);

    await userEvent.click(profileTrigger);
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(profileTrigger.querySelector('path')).toHaveAttribute('d', 'm18 15-6-6-6 6');
    const menu = await page.findByRole('menu', { name: '프로필 전환' });
    const picker = menu.parentElement;
    const openTriggerRect = profileTrigger.getBoundingClientRect();
    const openNavigationRect = drawer.getBoundingClientRect();
    expect(picker).not.toBeNull();
    const pickerRect = picker!.getBoundingClientRect();

    expect(openTriggerRect).toEqual(triggerRect);
    expect(openNavigationRect).toEqual(navigationRect);
    expect(pickerRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
    expect(pickerRect.top - triggerRect.bottom).toBeLessThanOrEqual(12);
  },
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

export const UniversalMobileNonHomeHeader: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    ...universalParameters,
    router: { pathname: '/notifications', slotLabel: '알림 화면' },
  },
  play: ({ canvasElement }) => {
    const menuButton = within(canvasElement).getByRole('button', { name: '메뉴 열기' });
    const header = menuButton.parentElement;
    const buttonRect = menuButton.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();

    expect(headerRect?.height).toBe(64);
    expect(
      Math.abs(buttonRect.y + buttonRect.height / 2 - (headerRect!.y + headerRect!.height / 2)),
    ).toBeLessThanOrEqual(1);
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

export const ResponsiveProfilePickerCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    ...universalParameters,
    relay: {
      data: longProfileQuery,
      mutationResponse: {
        selectProfile: {
          profile: additionalProfiles[0]!,
          session: {
            id: 'session-story',
            selectedProfile: { id: additionalProfiles[0]!.id },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '프로필 목록' });
    const route = canvas.getByText('홈 타임라인');

    await userEvent.click(trigger);
    const pickerRegion = await canvas.findByLabelText('프로필 전환');
    const picker = pickerRegion.parentElement;
    const list = canvas.getByLabelText('전환할 프로필 목록');
    const options = within(list).getAllByRole('button');
    const footerAction = canvas.getByRole('button', { name: '새 프로필 추가' });
    expect(pickerRegion).toBeVisible();
    expect(picker).not.toBeNull();
    expect(picker!.getBoundingClientRect().height).toBeLessThanOrEqual(430);
    expect(pickerRegion.getBoundingClientRect().left).toBeGreaterThanOrEqual(80);
    expect(canvas.queryByRole('dialog')).toBeNull();
    expect(options).toHaveLength(12);
    expect(trigger).toHaveFocus();
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(footerAction).toBeVisible();

    for (const option of options) {
      await userEvent.tab();
      expect(option).toHaveFocus();
    }
    const listRect = list.getBoundingClientRect();
    const focusedRect = options[11]!.getBoundingClientRect();
    expect(focusedRect.top).toBeGreaterThanOrEqual(listRect.top);
    expect(focusedRect.bottom).toBeLessThanOrEqual(listRect.bottom);
    await userEvent.tab();
    expect(footerAction).toHaveFocus();

    await userEvent.click(options[1]!);
    await waitFor(() => expect(canvas.queryByLabelText('프로필 전환')).toBeNull());

    await userEvent.click(trigger);
    await userEvent.click(route);
    expect(canvas.queryByLabelText('프로필 전환')).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(canvas.queryByLabelText('프로필 전환')).toBeNull();

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(canvas.queryByLabelText('프로필 전환')).toBeNull();
    expect(trigger).toHaveFocus();
  },
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
    const canvas = within(canvasElement);
    let leftRail: HTMLElement | null = canvas.getByRole('navigation', {
      name: '주요 메뉴',
    });

    while (leftRail && view?.getComputedStyle(leftRail).position !== 'sticky') {
      leftRail = leftRail.parentElement;
    }

    const rightRail = canvas.getByLabelText('새 게시글 작성').parentElement;
    const rightRailStyle = rightRail ? view?.getComputedStyle(rightRail) : undefined;
    const privacyLink = canvas.getByRole('link', { name: '개인정보 처리방침' });
    const rightRailRect = rightRail?.getBoundingClientRect();
    const privacyLinkRect = privacyLink.getBoundingClientRect();

    expect(leftRail).not.toBeNull();
    expect(leftRail?.getBoundingClientRect().height).toBeLessThanOrEqual(view?.innerHeight ?? 0);
    expect(rightRail).not.toBeNull();
    expect(rightRailStyle?.position).toBe('sticky');
    expect(rightRailStyle?.overflowX).toBe('hidden');
    expect(rightRailStyle?.overflowY).toBe('auto');
    expect(rightRail?.scrollWidth ?? 1).toBeLessThanOrEqual(rightRail?.clientWidth ?? 0);
    expect(privacyLink).toHaveAttribute('href', '/privacy');
    expect((rightRailRect?.bottom ?? 0) - privacyLinkRect.bottom).toBeLessThanOrEqual(spacing.sm);
  },
  render: () => (
    <View style={{ height: 1800 }}>
      <UniversalShellStory />
    </View>
  ),
};
