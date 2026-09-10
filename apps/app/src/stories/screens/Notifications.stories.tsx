import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import NotificationsScreen from '@/app/(tabs)/(protected)/notifications';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
import { NotificationReadAllProvider } from '@/components/notification/NotificationReadAllContext';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { colors } from '@/theme/tokens';
import {
  followNotification,
  followRequestNotification,
  notificationsProfile,
  post,
  profile,
  reactionNotification,
  replyNotification,
  repostNotification,
} from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RequestParameters, Variables } from 'relay-runtime';
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
const notificationReplyMedia = {
  __typename: 'Media' as const,
  altText: '답글 첨부 이미지',
  id: 'notification-reply-media',
  url: unreadFollowerAvatarUrl,
};

function notificationPost(options: Parameters<typeof post>[0] = {}) {
  return { ...post(options), viewerReactions: [] };
}

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
      post: notificationPost({ id: 'notification-related-post', profile: notificationRecipient }),
      profile: unreadFollower,
      type: '🎉',
    }),
    replyNotification({
      id: 'notification-reply',
      post: notificationPost({
        bodyText: '알림에서 바로 확인할 수 있는 답글 본문입니다.',
        contentWarning: '답글 내용에 주의가 필요합니다.',
        id: 'notification-reply-post',
        media: [notificationReplyMedia],
        profile: unreadFollower,
      }),
      profile: unreadFollower,
    }),
    repostNotification({
      id: 'notification-repost',
      post: notificationPost({
        id: 'notification-repost-related-post',
        profile: notificationRecipient,
      }),
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
const profileSwitchReplyNotification = replyNotification({
  id: 'notification-profile-a-reply',
  post: notificationPost({
    bodyText: '프로필 전환 중인 답글 본문입니다.',
    id: 'notification-profile-a-reply-post',
    media: [notificationReplyMedia],
    profile: unreadFollower,
  }),
  profile: unreadFollower,
});
const profileA = notificationsProfile(
  [
    followNotification({ id: 'notification-item-profile-a', profile: unreadFollower }),
    profileSwitchReplyNotification,
  ],
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

function notificationSurface(link: HTMLElement): HTMLElement {
  const surface = link.closest<HTMLElement>('[data-testid="notification-item-surface"]');
  if (!surface) {
    throw new Error('Notification target is missing its presentation surface.');
  }
  return surface;
}

function storyColors(theme: unknown) {
  return theme === 'dark' ? colors.dark : colors.light;
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

function AuthenticatedReadNavigationList() {
  return (
    <SessionProvider>
      <ReadNavigationList />
    </SessionProvider>
  );
}

const readMutationResponse = {
  markNotificationRead: {
    notifications: [
      {
        __typename: 'FollowNotification',
        id: 'notification-unread',
        readAt: '2026-07-21T12:00:00Z',
      },
    ],
    recipientProfiles: [
      {
        __typename: 'Profile',
        id: 'notification-profile-content',
        unreadNotificationCount: 2,
      },
    ],
  },
};

const replyReadMutationResponse = {
  markNotificationRead: {
    notifications: [
      {
        __typename: 'ReplyNotification',
        id: 'notification-reply',
        readAt: '2026-07-21T12:00:00Z',
      },
    ],
    recipientProfiles: [
      {
        __typename: 'Profile',
        id: 'notification-profile-content',
        unreadNotificationCount: 1,
      },
    ],
  },
};

const notificationMutationRequest = fn<(operationName: string, variables: Variables) => void>();

const repostReadMutationResponse = {
  markNotificationRead: {
    notifications: [
      {
        __typename: 'RepostNotification',
        id: 'notification-repost',
        readAt: '2026-07-21T12:00:00Z',
      },
    ],
    recipientProfiles: [
      {
        __typename: 'Profile',
        id: 'notification-profile-content',
        unreadNotificationCount: 2,
      },
    ],
  },
};

const readAllMutationResponse = {
  markNotificationRead: {
    notifications: [
      'notification-unread',
      'notification-follow-request',
      'notification-long',
      'notification-reaction',
      'notification-reply',
      'notification-repost',
    ].map((id) => ({
      __typename:
        id === 'notification-reaction'
          ? 'ReactionNotification'
          : id === 'notification-reply'
            ? 'ReplyNotification'
            : id === 'notification-repost'
              ? 'RepostNotification'
              : id === 'notification-follow-request'
                ? 'FollowRequestNotification'
                : 'FollowNotification',
      id,
      readAt: '2026-07-21T12:00:00Z',
    })),
    recipientProfiles: [
      {
        __typename: 'Profile',
        id: 'notification-profile-content',
        unreadNotificationCount: 1,
      },
    ],
  },
};

function ProfileSwitchList() {
  const profiles = useStoryProfiles();
  const [selected, setSelected] = useState<3 | 4>(3);
  const profileNode = requireProfile(profiles, selected);

  return (
    <SessionProvider>
      <Button onPress={() => setSelected((current) => (current === 3 ? 4 : 3))}>프로필 전환</Button>
      <NotificationList key={profileNode.id} profile={profileNode.notificationList!} />
    </SessionProvider>
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
  decorators: [
    (Story: typeof NotificationCatalog) => (
      <NotificationReadAllProvider>
        <Story />
      </NotificationReadAllProvider>
    ),
  ],
  parameters: {
    relay: { data: { nodes: storyProfiles } },
    router: { pathname: '/notifications' },
  },
  title: 'KOSMO/Screens/Notifications/Catalog',
} satisfies Meta<typeof NotificationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function verifyReadAllFailure(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: '모두 읽음' }));
  await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('알림을 모두 읽지 못했어요.');
  expect(canvas.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(
    canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/ }),
  ).toBeVisible();
  await waitFor(() => expect(canvas.getByRole('button', { name: '모두 읽음' })).not.toBeDisabled());
}

export const StatesAndFollowItems: Story = {
  play: ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const theme = storyColors(globals.theme);
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
    const unreadRow = notificationSurface(unreadCopyLink);
    const readRow = notificationSurface(readCopyLink);

    expect(unreadCopyLink).toBeVisible();
    expect(unreadRow).not.toBeNull();
    expect(readRow).not.toBeNull();
    expect(unreadRow).toHaveStyle({ backgroundColor: theme.actionPrimarySubtle });
    expect(getComputedStyle(readRow).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(unreadRow.firstElementChild!.getBoundingClientRect().left).toBe(
      readRow.firstElementChild!.getBoundingClientRect().left,
    );
    expect(
      canvas.getByRole('link', { name: /새 요청자님이 팔로우를 요청했습니다/ }),
    ).toHaveAttribute('href', '/follow-requests');
    expect(canvasElement.querySelector('a[href="/@starlight"]')).toBeInTheDocument();
    expect(
      canvas.getByRole('link', { name: /별빛 여행자님이 이 게시글에 반응했습니다/ }),
    ).toHaveAttribute('href', '/@recipient/notification-related-post');
    expect(canvas.getByTestId('notification-post-author')).toHaveAttribute('href', '/@starlight');
    expect(canvas.getByRole('link', { name: '5분 전' })).toHaveAttribute(
      'href',
      '/@starlight/notification-reply-post',
    );
    expect(
      canvas.getByRole('link', { name: /은하 기록자님이 이 게시글을 재게시했습니다/ }),
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
  play: ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const theme = storyColors(globals.theme);
    const heading = canvas.getByRole('heading', { name: '알림' });
    const action = canvas.getByRole('button', { name: '모두 읽음' });
    const headerRect = heading.parentElement!.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    const actionStyle = getComputedStyle(action);

    expect(heading).toBeVisible();
    expect(headerRect.height).toBe(64);
    expect(headerRect.right - actionRect.right).toBe(16);
    expect(action).toHaveStyle({ backgroundColor: theme.actionSecondaryBase });
    expect(action).toHaveStyle({ borderColor: theme.actionSecondaryBorder });
    expect(actionStyle.borderWidth).toBe('1px');
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

export const ReadAllLoadedUnread: Story = {
  parameters: { relay: { mutationResponse: readAllMutationResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByRole('button', { name: '모두 읽음' });
    expect(action).not.toBeDisabled();

    await userEvent.click(action);

    await expect(
      canvas.findByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }),
    ).resolves.toBeVisible();
    expect(
      canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }),
    ).not.toHaveAccessibleName(/읽지 않은 알림/);
    expect(canvas.getByRole('link', { name: /새 요청자님이 팔로우를 요청했습니다/ })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('button', { name: '모두 읽음' })).toBeDisabled());
  },
  render: () => <RefreshList />,
};

export const ReadAllLoadedZero: Story = {
  play: ({ canvasElement }) => {
    const action = within(canvasElement).getByRole('button', { name: '모두 읽음' });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-disabled', 'true');
  },
  render: () => {
    const profiles = useStoryProfiles();
    return <NotificationList profile={requireProfile(profiles, 0).notificationList!} />;
  },
};

export const ReadAllLoading: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '모두 읽음' }));
    await expect(canvas.findByRole('button', { name: '모두 읽음' })).resolves.toBeDisabled();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '모두 읽음' })).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    );
  },
  render: () => <RefreshList />,
};

export const ReadAllGraphQLError: Story = {
  parameters: {
    relay: {
      mutationGraphQLErrors: ['Read all failed'],
      mutationResponse: { markNotificationRead: { notifications: [], recipientProfiles: [] } },
    },
  },
  play: ({ canvasElement }) => verifyReadAllFailure(canvasElement),
  render: () => <RefreshList />,
};

export const ReadAllNullPayload: Story = {
  parameters: { relay: { mutationResponse: { markNotificationRead: null } } },
  play: ({ canvasElement }) => verifyReadAllFailure(canvasElement),
  render: () => <RefreshList />,
};

export const ReadAllPendingAndFailureRetry: Story = {
  parameters: {
    relay: {
      operationResponses: {
        NotificationListMarkAllReadMutation: {
          sequence: [{ error: 'Read all failed' }, { data: readAllMutationResponse }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByRole('button', { name: '모두 읽음' });
    await userEvent.click(action);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '알림을 모두 읽지 못했어요.',
    );
    await waitFor(() => expect(canvas.getByRole('button', { name: '다시 시도' })).toBeVisible());
    expect(
      canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/ }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(
      canvas.findByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }),
    ).resolves.toBeVisible();
  },
  render: () => <RefreshList />,
};

export const KeyboardFocusableProfileLink: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ });
    link.focus();
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('href', '/@starlight');
    expect(link).toHaveAccessibleName(/읽지 않은 알림/);
    expect(
      canvas.getByRole('link', { name: /은하 기록자님이 팔로우했습니다/ }),
    ).not.toHaveAccessibleName(/읽지 않은 알림/);
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
      canvas.findByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }),
    ).resolves.toBeVisible();
    const readCopyLink = await canvas.findByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const readRow = notificationSurface(readCopyLink);

    expect(readRow).not.toBeNull();
    expect(getComputedStyle(readRow).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(readRow.querySelector('[data-testid="notification-hover-overlay"]')).toBeInTheDocument();
    await userEvent.unhover(readCopyLink);
    expect(
      readRow.querySelector('[data-testid="notification-hover-overlay"]'),
    ).not.toBeInTheDocument();
  },
  render: () => <ReadNavigationList />,
};

export const RepostReadNormalizesAndNavigates: Story = {
  parameters: { relay: { mutationResponse: repostReadMutationResponse } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('link', { name: /은하 기록자님이 이 게시글을 재게시했습니다/ }),
    );
    await expect(
      canvas.findByText('/@recipient/notification-repost-related-post'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('link', { name: /은하 기록자님이 이 게시글을 재게시했습니다/ }),
    ).resolves.toBeVisible();
  },
  render: () => <ReadNavigationList />,
};

export const ReadPendingDoesNotBlockAvatarNavigation: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const theme = storyColors(globals.theme);
    await userEvent.click(
      canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/ }),
    );
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ })).toBeVisible();
    const unreadCopyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
    });
    const unreadRow = notificationSurface(unreadCopyLink);

    expect(unreadRow).not.toBeNull();
    expect(unreadRow).toHaveStyle({ backgroundColor: theme.actionPrimarySubtle });
    expect(
      unreadRow.querySelector('[data-testid="notification-hover-overlay"]'),
    ).toBeInTheDocument();
    await userEvent.unhover(unreadCopyLink);
    expect(
      unreadRow.querySelector('[data-testid="notification-hover-overlay"]'),
    ).not.toBeInTheDocument();
  },
  render: () => <ReadNavigationList />,
};

export const ReadNetworkErrorDoesNotBlockCopyNavigation: Story = {
  parameters: { relay: { mutationError: 'Read failed' } },
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const theme = storyColors(globals.theme);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    const unreadCopyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다.*읽지 않은 알림/,
    });
    const unreadRow = notificationSurface(unreadCopyLink);

    expect(unreadRow).not.toBeNull();
    expect(unreadRow).toHaveStyle({ backgroundColor: theme.actionPrimarySubtle });
    await userEvent.unhover(unreadCopyLink);
    expect(unreadRow).toHaveStyle({ backgroundColor: theme.actionPrimarySubtle });
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

export const ReplyContentAndProtectedActions: Story = {
  parameters: {
    relay: {
      mutationRequestObserver: (request: RequestParameters, variables: Variables) =>
        notificationMutationRequest(request.name, variables),
      operationResponses: {
        SessionProviderQuery: {
          data: {
            currentSession: {
              id: 'notification-session',
              selectedProfile: { id: 'notification-profile-content' },
            },
            me: { id: 'notification-account', name: 'Notification Story' },
          },
        },
      },
    },
    controls: { disable: true },
  },
  play: async ({ canvasElement }) => {
    notificationMutationRequest.mockClear();
    const canvas = within(canvasElement);

    await expect(canvas.findByTestId('post-content-warning')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '내용 보기' }));
    await expect(
      canvas.findByText('알림에서 바로 확인할 수 있는 답글 본문입니다.'),
    ).resolves.toBeVisible();
    expect(canvas.getByText('/notifications')).toBeVisible();
    expect(notificationMutationRequest).not.toHaveBeenCalledWith(
      'NotificationListItemMarkReadMutation',
      expect.anything(),
    );

    const replyButton = canvas.getByRole('button', { name: '답글' });
    await waitFor(() => expect(replyButton).not.toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(replyButton);
    const composer = await screen.findByRole('dialog', { name: '답글 쓰기' });
    await expect(composer).toBeVisible();
    expect(canvas.getByText('/notifications')).toBeVisible();
    expect(notificationMutationRequest).not.toHaveBeenCalledWith(
      'NotificationListItemMarkReadMutation',
      expect.anything(),
    );
    await userEvent.click(within(composer).getByRole('button', { name: '닫기' }));
    const confirm = await screen.findByRole('alertdialog', { name: '답글 작성을 취소할까요?' });
    await userEvent.click(within(confirm).getByRole('button', { name: '작성 취소' }));
    await expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).not.toBeInTheDocument();
    expect(canvas.getByText('/notifications')).toBeVisible();
    expect(replyButton).toHaveFocus();
    expect(notificationMutationRequest).not.toHaveBeenCalledWith(
      'NotificationListItemMarkReadMutation',
      expect.anything(),
    );
  },
  render: () => <AuthenticatedReadNavigationList />,
};

export const ReplyAuthorActivationReadsOnce: Story = {
  parameters: {
    relay: {
      mutationRequestObserver: (request: RequestParameters, variables: Variables) =>
        notificationMutationRequest(request.name, variables),
      mutationResponse: replyReadMutationResponse,
    },
    controls: { disable: true },
  },
  play: async ({ canvasElement }) => {
    notificationMutationRequest.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '내용 보기' }));
    await expect(
      canvas.findByText('알림에서 바로 확인할 수 있는 답글 본문입니다.'),
    ).resolves.toBeVisible();
    expect(canvas.getByText('/notifications')).toBeVisible();
    expect(notificationMutationRequest).not.toHaveBeenCalledWith(
      'NotificationListItemMarkReadMutation',
      expect.anything(),
    );

    const detailPath = '/@starlight/notification-reply-post';
    const activations = [
      { target: canvas.getByTestId('notification-post-author'), path: '/@starlight' },
      { target: canvas.getByRole('link', { name: '5분 전' }), path: detailPath },
      { target: canvas.getByTestId('post-list-row-body'), path: detailPath },
      {
        target: canvas.getByTestId('post-media-open-notification-reply-media'),
        path: detailPath,
        opensViewer: true,
      },
    ];

    for (const activation of activations) {
      notificationMutationRequest.mockClear();
      await userEvent.click(activation.target);
      await expect(canvas.findByText(activation.path)).resolves.toBeVisible();
      if (activation.opensViewer) {
        await waitFor(() => expect(screen.getByTestId('post-media-viewer-dialog')).toBeVisible());
      }
      expect(notificationMutationRequest).toHaveBeenCalledTimes(1);
      expect(notificationMutationRequest).toHaveBeenCalledWith(
        'NotificationListItemMarkReadMutation',
        { ids: ['notification-reply'] },
      );

      if (activation.target === activations[0]!.target) {
        await waitFor(() => expect(canvas.queryByText('읽지 않은 알림')).not.toBeInTheDocument());
      }

      if (activation.opensViewer) {
        await userEvent.click(screen.getByTestId('post-media-viewer-close'));
        await expect(screen.queryByTestId('post-media-viewer-dialog')).not.toBeInTheDocument();
      }
    }
  },
  render: () => <ReadNavigationList />,
};

export const FigmaFollowRowHierarchy: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const surface = notificationSurface(followLink);
    const avatar = canvas.getAllByLabelText('별빛 여행자 프로필 이미지')[0];
    const kindIcon = surface.querySelector('svg')?.parentElement;
    const copyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const copy = [...copyLink.querySelectorAll<HTMLElement>('[dir="auto"]')].find((element) =>
      element.textContent?.includes('팔로우했습니다'),
    );
    const timestamp = canvas.getAllByText('5분 전')[0];

    expect(kindIcon).not.toBeNull();
    expect(avatar).toBeVisible();
    expect(copy).toBeVisible();
    expect(timestamp).toBeVisible();

    const kindRect = kindIcon!.getBoundingClientRect();
    const avatarRect = avatar!.getBoundingClientRect();
    expect(kindRect.width).toBe(48);
    expect(kindRect.height).toBe(48);
    expect(avatarRect.width).toBe(28);
    expect(avatarRect.height).toBe(28);
    expect(avatarRect.top).toBe(kindRect.top);
    expect(timestamp!.getBoundingClientRect().top).toBeLessThan(copy!.getBoundingClientRect().top);
  },
  render: () => <RefreshList />,
};

export const HoverBackgroundFeedback: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const theme = storyColors(globals.theme);
    const copyLink = canvas.getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const row = notificationSurface(copyLink);

    expect(row).not.toBeNull();
    expect(row).toHaveStyle({ backgroundColor: theme.actionPrimarySubtle });
    expect(row.querySelector('[data-testid="notification-hover-overlay"]')).not.toBeInTheDocument();
    await userEvent.hover(row!);
    expect(row).toHaveStyle({ backgroundColor: theme.actionPrimarySubtle });
    expect(row.querySelector('[data-testid="notification-hover-overlay"]')).toBeInTheDocument();
    await userEvent.hover(copyLink);
    expect(row.querySelector('[data-testid="notification-hover-overlay"]')).toBeInTheDocument();
    await userEvent.unhover(copyLink);
    expect(row.querySelector('[data-testid="notification-hover-overlay"]')).not.toBeInTheDocument();
  },
  render: () => <RefreshList />,
};

export const NonInteractiveRowAndCompactCopyLink: Story = {
  play: ({ canvasElement }) => {
    const copyLink = within(canvasElement).getByRole('link', {
      name: /별빛 여행자님이 팔로우했습니다/,
    });
    const copy = copyLink.querySelector('[dir="auto"]');
    const row = notificationSurface(copyLink);

    expect(copy).not.toBeNull();
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute('tabindex');
    expect(copyLink.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(copy!.getBoundingClientRect().height).toBeLessThan(44);
    expect(row.getBoundingClientRect().height).toBeLessThan(100);
  },
  render: () => <RefreshList />,
};

export const SelectedProfileSwitch: Story = {
  parameters: {
    relay: {
      operationResponses: {
        SessionProviderQuery: {
          data: {
            currentSession: {
              id: 'notification-session',
              selectedProfile: { id: 'notification-profile-a' },
            },
            me: { id: 'notification-account', name: 'Notification Story' },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const switchButton = canvas.getByRole('button', { name: '프로필 전환' });
    expect(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '답글' }));
    await expect(screen.findByRole('dialog', { name: '답글 쓰기' })).resolves.toBeVisible();
    fireEvent.click(switchButton);
    await expect(
      canvas.findByRole('link', { name: /은하 기록자님이 팔로우했습니다/ }),
    ).resolves.toBeVisible();
    expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(switchButton);
    await expect(canvas.findByTestId('reply-notification-post')).resolves.toBeVisible();
    await userEvent.click(canvas.getByTestId('post-media-open-notification-reply-media'));
    await waitFor(() => expect(screen.getByTestId('post-media-viewer-dialog')).toBeVisible());

    fireEvent.click(switchButton);
    await expect(
      canvas.findByRole('link', { name: /은하 기록자님이 팔로우했습니다/ }),
    ).resolves.toBeVisible();
    expect(screen.queryByTestId('post-media-viewer-dialog')).not.toBeInTheDocument();
  },
  render: () => <ProfileSwitchList />,
};

export const ActorResetClearsPaginationError: Story = {
  parameters: {
    relay: {
      actorBoundary: true,
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
