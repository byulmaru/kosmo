import { useWindowDimensions, View } from 'react-native';
import PostActivityRoute from '@/app/(tabs)/(post)/[profileHandle]/[postId]/activity';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

export const activityPostId = 'post-activity-story';
export const activityOwner = profile({
  displayName: '게시 활동 작가',
  handle: 'activity-owner',
  id: 'profile-activity-owner',
  relativeHandle: '@activity-owner',
});
export const activityProfiles = [
  profile({
    bio: '목록에서 숨겨야 하는 소개입니다.',
    displayName: '별빛 여행자',
    handle: 'activity-starlight',
    id: 'profile-activity-starlight',
    relativeHandle: '@activity-starlight',
  }),
  profile({
    displayName: '은하 기록자',
    handle: 'activity-galaxy',
    id: 'profile-activity-galaxy',
    relativeHandle: '@activity-galaxy',
  }),
];
export const switchedActivityProfiles = [
  profile({
    displayName: '전환된 혜성',
    handle: 'activity-comet',
    id: 'profile-activity-comet',
    relativeHandle: '@activity-comet',
  }),
];

function profileConnection(
  profiles: ReadonlyArray<ReturnType<typeof profile>>,
  hasNextPage = false,
) {
  return {
    __typename: 'ProfileConnection' as const,
    edges: profiles.map((node, index) => ({
      cursor: `activity-cursor-${node.id}-${index}`,
      node,
    })),
    pageInfo: {
      endCursor: profiles.length
        ? `activity-cursor-${profiles.at(-1)!.id}-${profiles.length - 1}`
        : null,
      hasNextPage,
      hasPreviousPage: false,
      startCursor: profiles.length ? `activity-cursor-${profiles[0]!.id}-0` : null,
    },
  };
}

export function activityPost(
  profiles: ReadonlyArray<ReturnType<typeof profile>> = activityProfiles,
  hasNextPage = false,
  repostProfiles: ReturnType<typeof profileConnection> | null = profileConnection(
    profiles,
    hasNextPage,
  ),
) {
  return {
    node: {
      __typename: 'Post' as const,
      content: { id: 'content-activity-story' },
      id: activityPostId,
      profile: activityOwner,
      repostProfiles,
      state: 'ACTIVE' as const,
    },
  };
}

function ActivityStorySurface() {
  const { height } = useWindowDimensions();

  return (
    <View style={{ alignSelf: 'center', maxWidth: 600, minHeight: height, width: '100%' }}>
      <PostActivityRoute />
    </View>
  );
}

const meta = {
  component: ActivityStorySurface,
  parameters: {
    layout: 'fullscreen',
    relay: { operationResponses: { PostActivityRouteQuery: { data: activityPost() } } },
    router: {
      params: { postId: activityPostId, profileHandle: '@activity-owner' },
      pathname: `/@activity-owner/${activityPostId}/activity`,
    },
  },
  title: 'KOSMO/Screens/Post Activity',
} satisfies Meta<typeof ActivityStorySurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  parameters: {
    relay: { operationResponses: { PostActivityRouteQuery: { data: activityPost([]) } } },
  },
};

export const AccessDenied: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostActivityRouteQuery: { data: activityPost([], false, null) },
      },
    },
  },
};

export const InitialErrorRetry: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostActivityRouteQuery: {
          sequence: [{ error: '게시 활동 최초 조회 실패' }, { data: activityPost() }],
        },
      },
    },
  },
};

export const PaginationFailurePreservesRowsAndRetries: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostActivityRouteQuery: { data: activityPost(activityProfiles, true) },
      },
      paginationResponses: [
        { error: '게시 활동 다음 page 실패' },
        { data: activityPost(switchedActivityProfiles) },
      ],
    },
  },
};

export function ActorSwitchActivity() {
  return <ActivityStorySurface />;
}
