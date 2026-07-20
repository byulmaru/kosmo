import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import NotificationsScreen from '@/app/(tabs)/(protected)/notifications';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { followNotification, notificationsProfile, profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NotificationsStoriesQuery as NotificationsStoriesQueryType } from './__generated__/NotificationsStoriesQuery.graphql';

const unreadFollower = profile({
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
const longFollower = profile({
  displayName: '아주 긴 표시 이름을 가진 먼 우주의 새로운 팔로워',
  handle: 'a-very-long-remote-follower',
  id: 'notification-follower-long',
  relativeHandle: '@a-very-long-remote-follower@very-long-instance.example',
});

const emptyProfile = notificationsProfile([], {}, { id: 'notification-profile-empty' });
const contentProfile = notificationsProfile(
  [
    followNotification({ id: 'notification-unread', profile: unreadFollower }),
    followNotification({
      id: 'notification-read',
      profile: readFollower,
      readAt: '2026-07-17T02:00:00Z',
    }),
    followNotification({ id: 'notification-long', profile: longFollower }),
  ],
  {},
  { id: 'notification-profile-content' },
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
    expect(canvas.getByText('아직 알림이 없어요')).toBeVisible();
    expect(
      canvas.getByRole('link', {
        name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
      }),
    ).toBeVisible();
    expect(canvasElement.querySelector('a[href="/@starlight"]')).toBeInTheDocument();
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
    expect(canvas.getByRole('heading', { name: '알림' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '알림 설정 (준비 중)' })).toBeDisabled();
    expect(canvas.queryByText('KOSMO')).not.toBeInTheDocument();
    expect(canvas.queryByRole('heading', { name: '모두' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
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
    const copyLink = within(canvasElement).getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const row = copyLink.parentElement?.parentElement;

    expect(row).not.toBeNull();
    expect(row).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
    await userEvent.hover(row!);
    expect(row).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    await userEvent.unhover(row!);
    expect(row).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
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
    expect(canvas.getByRole('heading', { name: '알림' })).toBeVisible();
    expect(canvas.getByText('프로필이 필요해요')).toBeVisible();
  },
  render: () => <NotificationsScreen />,
};
