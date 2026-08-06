import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import NotificationsScreen from '@/app/(tabs)/(protected)/notifications';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import {
  followNotification,
  followRequestNotification,
  notificationsProfile,
  post,
  profile,
  reactionNotification,
  replyNotification,
  repostNotification,
} from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NotificationsStoriesQuery as NotificationsStoriesQueryType } from './__generated__/NotificationsStoriesQuery.graphql';

const unreadFollowerAvatarUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect width="56" height="56" fill="%237c3aed"/%3E%3C/svg%3E';
const unreadFollower = profile({
  avatar: { id: 'media-notification-follower-avatar', url: unreadFollowerAvatarUrl },
  displayName: '별빛 여행자',
  handle: 'starlight',
  id: 'notification-follower-unread',
  relativeHandle: '@starlight',
});
const readFollower = profile({
  displayName: '은하 기록자',
  handle: 'galaxy',
  id: 'notification-follower-read',
  relativeHandle: '@galaxy',
});
const followRequestFollower = profile({
  displayName: '새 요청자',
  handle: 'requester',
  id: 'notification-follower-requester',
  relativeHandle: '@requester',
});
const longFollower = profile({
  displayName: '아주 긴 표시 이름을 가진 먼 우주의 새로운 팔로워',
  handle: 'a-very-long-remote-follower',
  id: 'notification-follower-long',
  relativeHandle: '@a-very-long-remote-follower@very-long-instance.example',
});
const notificationRecipient = profile({
  id: 'notification-profile-content',
  relativeHandle: '@recipient',
});

const emptyProfile = notificationsProfile([], {}, { id: 'notification-profile-empty' });
const contentProfile = notificationsProfile(
  [
    followNotification({ id: 'notification-unread', profile: unreadFollower }),
    followRequestNotification({
      id: 'notification-follow-request',
      profile: followRequestFollower,
    }),
    followNotification({
      id: 'notification-read',
      profile: readFollower,
      readAt: '2026-07-17T02:00:00Z',
    }),
    followNotification({ id: 'notification-long', profile: longFollower }),
    reactionNotification({
      id: 'notification-reaction',
      post: post({ id: 'notification-related-post', profile: notificationRecipient }),
      profile: unreadFollower,
      type: '🎉',
    }),
    replyNotification({
      id: 'notification-reply',
      post: post({ id: 'notification-reply-post', profile: notificationRecipient }),
      profile: unreadFollower,
    }),
    repostNotification({
      id: 'notification-repost',
      post: post({ id: 'notification-repost-related-post', profile: notificationRecipient }),
      profile: readFollower,
    }),
  ],
  {},
  notificationRecipient,
);
const paginationProfile = notificationsProfile(
  [followNotification({ id: 'notification-page-1', profile: unreadFollower })],
  { hasNext: true },
  { id: 'notification-profile-pagination' },
);
const profileA = notificationsProfile(
  [followNotification({ id: 'notification-item-profile-a', profile: unreadFollower })],
  {},
  { id: 'notification-profile-a' },
);
const profileB = notificationsProfile(
  [followNotification({ id: 'notification-item-profile-b', profile: readFollower })],
  {},
  { id: 'notification-profile-b' },
);
const storyProfiles = [emptyProfile, contentProfile, paginationProfile, profileA, profileB];

const NotificationsStoriesQuery = graphql`
  query NotificationsStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...NotificationList_profile @alias(as: "notificationList")
      }
    }
  }
`;

type ProfileNode = Extract<
  NonNullable<NotificationsStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Profile' }
>;

function useStoryProfiles(): ReadonlyArray<ProfileNode> {
  const data = useLazyLoadQuery<NotificationsStoriesQueryType>(NotificationsStoriesQuery, {
    ids: storyProfiles.map(({ id }) => id),
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.notificationList) {
      throw new Error('NotificationsStoriesQuery must return Profile fragments in fixture order.');
    }
    return node;
  });
}

function requireProfile(profiles: ReadonlyArray<ProfileNode>, index: number): ProfileNode {
  const result = profiles[index];
  if (!result?.notificationList) {
    throw new Error(`Missing notification profile fixture at index ${index}.`);
  }
  return result;
}

function NotificationCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Loading">
        <NotificationListState state="loading" />
      </Section>
      <Section title="Error and retry">
        <NotificationListState onRetry={() => undefined} state="error" />
      </Section>
      <Section title="Profile required">
        <NotificationListState state="profileRequired" />
      </Section>
      <Section title="Empty">
        <NotificationList profile={requireProfile(profiles, 0).notificationList!} />
      </Section>
      <Section title="Unread / read / long content">
        <NotificationList profile={requireProfile(profiles, 1).notificationList!} />
      </Section>
    </Catalog>
  );
}

function PaginationList() {
  const profileNode = requireProfile(useStoryProfiles(), 2);
  return <NotificationList profile={profileNode.notificationList!} />;
}

function RefreshList() {
  const profileNode = requireProfile(useStoryProfiles(), 1);
  return <NotificationList profile={profileNode.notificationList!} />;
}

function ReadNavigationList() {
  const pathname = usePathname();

  return (
    <>
      <Text>{pathname}</Text>
      <RefreshList />
    </>
  );
}

const readMutationResponse = {
  markNotificationRead: {
    notification: {
      __typename: 'FollowNotification',
      id: 'notification-unread',
      readAt: '2026-07-21T12:00:00Z',
    },
    recipientProfile: {
      __typename: 'Profile',
      id: 'notification-profile-content',
      unreadNotificationCount: 2,
    },
  },
};

const repostReadMutationResponse = {
  markNotificationRead: {
    notification: {
      __typename: 'RepostNotification',
      id: 'notification-repost',
      readAt: '2026-07-21T12:00:00Z',
    },
    recipientProfile: {
      __typename: 'Profile',
      id: 'notification-profile-content',
      unreadNotificationCount: 2,
    },
  },
};

function ProfileSwitchList() {
  const profiles = useStoryProfiles();
  const [selected, setSelected] = useState<3 | 4>(3);
  const profileNode = requireProfile(profiles, selected);

  return (
    <>
      <Button onPress={() => setSelected((current) => (current === 3 ? 4 : 3))}>프로필 전환</Button>
      <NotificationList key={profileNode.id} profile={profileNode.notificationList!} />
    </>
  );
}

function ActorResetNotificationScreen() {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor('notification-profile-after-switch')}>프로필 전환</Button>
      <NotificationsScreen />
    </>
  );
}

const meta = {
  component: NotificationCatalog,
  parameters: {
    relay: { data: { nodes: storyProfiles } },
    router: { pathname: '/notifications' },
  },
  title: 'KOSMO/Notifications/List',
} satisfies Meta<typeof NotificationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatesAndFollowItems: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const avatar of canvas.getAllByLabelText('별빛 여행자 프로필 이미지')) {
      expect(avatar.querySelector('img')).toHaveAttribute('src', unreadFollowerAvatarUrl);
    }
    for (const avatar of canvas.getAllByLabelText('은하 기록자 프로필 이미지')) {
      expect(avatar.querySelector('img')?.getAttribute('src')).toMatch(
        /\/assets\/avatar\/default-avatar\.png$/,
      );
    }
    expect(canvas.getByText('아직 알림이 없어요')).toBeVisible();
    const unreadCopyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
    });
    const readCopyLink = canvas.getByRole('link', {
      name: /은하 기록자님이 팔로우했습니다/,
    });
    const unreadRow = unreadCopyLink.parentElement?.parentElement;
    const readRow = readCopyLink.parentElement?.parentElement;

    expect(unreadCopyLink).toBeVisible();
    expect(unreadRow).not.toBeNull();
    expect(readRow).not.toBeNull();
    expect(getComputedStyle(unreadRow!).backgroundColor).toBe('rgba(252, 231, 154, 0.3)');
    expect(getComputedStyle(unreadRow!).borderLeftColor).toBe('rgb(252, 231, 154)');
    expect(getComputedStyle(unreadRow!).borderLeftWidth).toBe('4px');
    expect(getComputedStyle(unreadRow!).paddingLeft).toBe('12px');
    expect(getComputedStyle(readRow!).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(readRow!).borderLeftColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(readRow!).borderLeftWidth).toBe('4px');
    expect(getComputedStyle(readRow!).paddingLeft).toBe('12px');
    expect(unreadRow!.firstElementChild!.getBoundingClientRect().left).toBe(
      readRow!.firstElementChild!.getBoundingClientRect().left,
    );
    expect(
      canvas.getByRole('link', { name: /새 요청자님이 팔로우를 요청했습니다/ }),
    ).toHaveAttribute('href', '/@requester');
    expect(canvasElement.querySelector('a[href="/@starlight"]')).toBeInTheDocument();
    expect(
      canvas.getByRole('link', { name: /별빛 여행자님이 🎉 반응을 남겼습니다/ }),
    ).toHaveAttribute('href', '/@recipient/notification-related-post');
    expect(canvas.getByRole('link', { name: /별빛 여행자님이 답글을 남겼습니다/ })).toHaveAttribute(
      'href',
      '/@recipient/notification-reply-post',
    );
    expect(
      canvas.getByRole('link', { name: /은하 기록자님이 게시물을 재게시했습니다/ }),
    ).toHaveAttribute('href', '/@recipient/notification-repost-related-post');
  },
};

export const NextPageLoading: Story = {
  parameters: { relay: { paginationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('button', { name: '불러오는 중' })).resolves.toBeDisabled();
  },
  render: () => <PaginationList />,
};

export const NextPageFailureAndRetry: Story = {
  parameters: { relay: { paginationError: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '알림을 더 불러오지 못했어요',
    );
    expect(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ })).toBeVisible();
  },
  render: () => <PaginationList />,
};

export const HeaderAndWebRefreshPolicy: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole('heading', { name: '알림' });

    expect(heading).toBeVisible();
    expect(heading.parentElement?.getBoundingClientRect().height).toBe(64);
    expect(canvas.queryByRole('button', { name: '알림 설정 (준비 중)' })).not.toBeInTheDocument();
    expect(canvas.queryByText('KOSMO')).not.toBeInTheDocument();
    expect(canvas.queryByRole('heading', { name: '모두' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
  },
  render: () => <RefreshList />,
};

export const MobileHeaderOwnedByShell: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('heading', { name: '알림' })).not.toBeInTheDocument();
  },
  render: () => <RefreshList />,
};

export const KeyboardFocusableProfileLink: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ });
    const unreadAvatarLink = canvas.getByRole('link', {
      name: '별빛 여행자 프로필로 이동. 읽지 않은 알림.',
    });
    const readAvatarLink = canvas.getByRole('link', {
      name: '은하 기록자 프로필로 이동.',
    });

    link.focus();
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('href', '/@starlight');
    expect(unreadAvatarLink).toHaveAttribute('href', '/@starlight');
    expect(readAvatarLink).toHaveAttribute('href', '/@galaxy');
    expect(readAvatarLink).not.toHaveAccessibleName(/읽지 않은 알림/);
  },
  render: () => <RefreshList />,
};

export const ReadSuccessNormalizesAndNavigates: Story = {
  parameters: { relay: { mutationResponse: readMutationResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('link', { name: '별빛 여행자 프로필로 이동.' }),
    ).resolves.toBeVisible();
    const readCopyLink = await canvas.findByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const readRow = readCopyLink.parentElement?.parentElement;

    expect(readRow).not.toBeNull();
    expect(getComputedStyle(readRow!).backgroundColor).toBe('rgb(246, 246, 246)');
    expect(getComputedStyle(readRow!).borderLeftColor).toBe('rgba(0, 0, 0, 0)');
    await userEvent.unhover(readCopyLink);
    expect(getComputedStyle(readRow!).backgroundColor).toBe('rgb(255, 255, 255)');
  },
  render: () => <ReadNavigationList />,
};

export const RepostReadNormalizesAndNavigates: Story = {
  parameters: { relay: { mutationResponse: repostReadMutationResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('link', { name: /은하 기록자님이 게시물을 재게시했습니다/ }),
    );
    await expect(
      canvas.findByText('/@recipient/notification-repost-related-post'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('link', { name: '은하 기록자 게시글로 이동.' }),
    ).resolves.toBeVisible();
  },
  render: () => <ReadNavigationList />,
};

export const ReadPendingDoesNotBlockAvatarNavigation: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('link', {
        name: '별빛 여행자 프로필로 이동. 읽지 않은 알림.',
      }),
    );
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(
      canvas.getByRole('link', {
        name: '별빛 여행자 프로필로 이동. 읽지 않은 알림.',
      }),
    ).toBeVisible();
    const unreadCopyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
    });
    const unreadRow = unreadCopyLink.parentElement?.parentElement;

    expect(unreadRow).not.toBeNull();
    expect(getComputedStyle(unreadRow!).backgroundColor).toBe('rgb(246, 246, 246)');
    expect(getComputedStyle(unreadRow!).borderLeftColor).toBe('rgb(252, 231, 154)');
    await userEvent.unhover(unreadCopyLink);
    expect(getComputedStyle(unreadRow!).backgroundColor).toBe('rgba(252, 231, 154, 0.3)');
  },
  render: () => <ReadNavigationList />,
};

export const ReadNetworkErrorDoesNotBlockCopyNavigation: Story = {
  parameters: { relay: { mutationError: 'Read failed' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    const unreadCopyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
    });
    const unreadRow = unreadCopyLink.parentElement?.parentElement;

    expect(unreadRow).not.toBeNull();
    expect(getComputedStyle(unreadRow!).backgroundColor).toBe('rgb(246, 246, 246)');
    expect(getComputedStyle(unreadRow!).borderLeftColor).toBe('rgb(252, 231, 154)');
    await userEvent.unhover(unreadCopyLink);
    expect(getComputedStyle(unreadRow!).backgroundColor).toBe('rgba(252, 231, 154, 0.3)');
  },
  render: () => <ReadNavigationList />,
};

export const ReadGraphQLErrorDoesNotBlockNavigation: Story = {
  parameters: {
    relay: {
      mutationGraphQLErrors: ['Read failed'],
      mutationResponse: { markNotificationRead: null },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
  render: () => <ReadNavigationList />,
};

export const FigmaFollowRowHierarchy: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getAllByLabelText('별빛 여행자 프로필 이미지')[0];
    const avatarLink = avatar?.closest('a');
    let content = avatarLink?.parentElement;
    while (content && !content.previousElementSibling) {
      content = content.parentElement;
    }
    const kindIcon = content?.previousElementSibling;
    const copyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const copy = copyLink.querySelector('[dir="auto"]');
    const timestamp = canvas.getAllByText('5분 전')[0];

    expect(kindIcon).not.toBeNull();
    expect(avatar).toBeVisible();
    expect(copy).toBeVisible();
    expect(timestamp).toBeVisible();

    const kindRect = kindIcon!.getBoundingClientRect();
    const avatarRect = avatar!.getBoundingClientRect();
    expect(kindRect.width).toBe(28);
    expect(kindRect.height).toBe(28);
    expect(avatarRect.width).toBe(28);
    expect(avatarRect.height).toBe(28);
    expect(avatarRect.top).toBe(kindRect.top);
    expect(timestamp!.getBoundingClientRect().top).toBeLessThan(copy!.getBoundingClientRect().top);
  },
  render: () => <RefreshList />,
};

export const HoverBackgroundFeedback: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatarLink = canvas.getByRole('link', {
      name: '별빛 여행자 프로필로 이동. 읽지 않은 알림.',
    });
    const copyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const row = copyLink.parentElement?.parentElement;

    expect(row).not.toBeNull();
    expect(row).toHaveStyle({ backgroundColor: 'rgba(252, 231, 154, 0.3)' });
    expect(getComputedStyle(row!).borderLeftColor).toBe('rgb(252, 231, 154)');
    await userEvent.hover(row!);
    expect(row).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    expect(getComputedStyle(row!).borderLeftColor).toBe('rgb(252, 231, 154)');
    await userEvent.hover(copyLink);
    expect(row).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    await userEvent.unhover(copyLink);
    expect(row).toHaveStyle({ backgroundColor: 'rgba(252, 231, 154, 0.3)' });
    await userEvent.hover(row!);
    expect(row).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    await userEvent.hover(avatarLink);
    expect(row).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    await userEvent.unhover(avatarLink);
    expect(row).toHaveStyle({ backgroundColor: 'rgba(252, 231, 154, 0.3)' });
  },
  render: () => <RefreshList />,
};

export const NonInteractiveRowAndCompactCopyLink: Story = {
  play: ({ canvasElement }) => {
    const copyLink = within(canvasElement).getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const copy = copyLink.querySelector('[dir="auto"]');
    const row = copyLink.parentElement?.parentElement;

    expect(copy).not.toBeNull();
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute('tabindex');
    expect(copyLink.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(copy!.getBoundingClientRect().height).toBeLessThan(44);
    expect(row!.getBoundingClientRect().height).toBeLessThan(100);
  },
  render: () => <RefreshList />,
};

export const SelectedProfileSwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '프로필 전환' }));
    await expect(
      canvas.findByRole('link', { name: /은하 기록자님이 팔로우했습니다/ }),
    ).resolves.toBeVisible();
    expect(
      canvas.queryByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }),
    ).not.toBeInTheDocument();
  },
  render: () => <ProfileSwitchList />,
};

export const ActorResetClearsPaginationError: Story = {
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'notification-session', selectedProfile: paginationProfile },
      },
      paginationError: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '알림을 더 불러오지 못했어요',
    );

    await userEvent.click(canvas.getByRole('button', { name: '프로필 전환' }));

    await expect(canvas.findByRole('button', { name: '더 불러오기' })).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
  render: () => <ActorResetNotificationScreen />,
};

export const SelectedProfileScreen: Story = {
  parameters: {
    relay: {
      data: { currentSession: { id: 'notification-session', selectedProfile: contentProfile } },
    },
  },
  play: ({ canvasElement }) => {
    expect(
      within(canvasElement).getByRole('link', {
        name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
      }),
    ).toBeVisible();
  },
  render: () => <NotificationsScreen />,
};

export const NoSelectedProfileScreen: Story = {
  parameters: {
    relay: { data: { currentSession: { id: 'notification-session', selectedProfile: null } } },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole('heading', { name: '알림' });

    expect(heading).toBeVisible();
    expect(heading.parentElement?.getBoundingClientRect().height).toBe(64);
    expect(canvas.getByText('프로필이 필요해요')).toBeVisible();
  },
  render: () => <NotificationsScreen />,
};

export const MobileNoSelectedProfileScreen: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: NoSelectedProfileScreen.parameters,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.queryByRole('heading', { name: '알림' })).not.toBeInTheDocument();
    expect(canvas.getByText('프로필이 필요해요')).toBeVisible();
  },
  render: () => <NotificationsScreen />,
};
