<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type {
    ProfileConnectionList_followersProfile$key,
    ProfileConnectionList_followingProfile$key,
    ProfileListItem_profile$key,
  } from '$mearie';

  import ProfileConnectionList from './ProfileConnectionList.svelte';

  type FollowState = 'ACCEPTED' | 'PENDING';

  const viewerProfileId = 'viewer-profile';

  const profile = (
    overrides: Partial<{
      id: string;
      displayName: string;
      handle: string;
      bio: string | null;
      viewerFollow: { id: string; state: FollowState } | null;
    }> = {},
  ): ProfileListItem_profile$key =>
    ({
      __typename: 'Profile',
      id: 'connection-profile',
      displayName: '연결된 프로필',
      handle: 'connected',
      bio: '팔로우 관계 목록에서 표시되는 프로필입니다.',
      viewerFollow: null,
      ...overrides,
    }) as unknown as ProfileListItem_profile$key;

  const additionalProfileItems = (kind: 'followers' | 'following') => [
    {
      cursor: `${kind}-edge-3`,
      profile: profile({
        id: `${kind}-page-2-profile`,
        displayName: '다음 페이지 프로필',
        handle: `${kind}-next-page`,
      }),
    },
  ];

  const followersProfile = (
    pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
      hasNextPage: true,
      endCursor: 'follower-edge-2',
    },
  ): ProfileConnectionList_followersProfile$key =>
    ({
      __typename: 'Profile',
      id: 'target-profile',
      followers: {
        pageInfo,
        edges: [
          {
            cursor: 'follower-edge-1',
            node: {
              __typename: 'ProfileFollow',
              id: 'follower-follow-1',
              follower: profile({
                id: 'follower-1',
                displayName: '첫 번째 팔로워',
                handle: 'first-follower',
              }),
            },
          },
          {
            cursor: 'follower-edge-2',
            node: {
              __typename: 'ProfileFollow',
              id: 'follower-follow-2',
              follower: profile({
                id: 'follower-2',
                displayName: '두 번째 팔로워',
                handle: 'second-follower',
                viewerFollow: { id: 'viewer-follow-2', state: 'ACCEPTED' },
              }),
            },
          },
        ],
      },
    }) as unknown as ProfileConnectionList_followersProfile$key;

  const followingProfile = (
    pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
      hasNextPage: true,
      endCursor: 'following-edge-1',
    },
  ): ProfileConnectionList_followingProfile$key =>
    ({
      __typename: 'Profile',
      id: 'target-profile',
      following: {
        pageInfo,
        edges: [
          {
            cursor: 'following-edge-1',
            node: {
              __typename: 'ProfileFollow',
              id: 'following-follow-1',
              followee: profile({
                id: 'followee-1',
                displayName: '팔로잉 대상',
                handle: 'followee',
              }),
            },
          },
        ],
      },
    }) as unknown as ProfileConnectionList_followingProfile$key;

  const lastPageInfo = { hasNextPage: false, endCursor: null };

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileConnectionList',
    component: ProfileConnectionList,
    tags: ['autodocs'],
    argTypes: {
      kind: {
        control: 'radio',
        options: ['followers', 'following'],
      },
    },
  });
</script>

<Story
  name="Playground"
  args={{
    kind: 'followers',
    followersProfile: followersProfile(),
    viewerProfileId,
    loading: false,
    error: false,
    onLoadMore: () => {},
  }}
/>

<!-- 팔로워 목록 영역의 상태 전체: 로딩, 오류, 항목 있음, 빈 상태. -->
<Story name="Followers states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfileConnectionList kind="followers" loading />
    <ProfileConnectionList kind="followers" error onRetry={() => {}} />
    <ProfileConnectionList
      kind="followers"
      followersProfile={followersProfile()}
      {viewerProfileId}
      onLoadMore={() => {}}
    />
    <ProfileConnectionList kind="followers" />
  </div>
</Story>

<!-- 팔로워 목록의 pagination 상태: 추가 로드 가능, 로딩, 실패, 마지막 페이지. -->
<Story name="Followers pagination states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfileConnectionList
      kind="followers"
      followersProfile={followersProfile()}
      {viewerProfileId}
      onLoadMore={() => {}}
    />
    <ProfileConnectionList
      kind="followers"
      followersProfile={followersProfile()}
      {viewerProfileId}
      loadingNextPage
      onLoadMore={() => {}}
    />
    <ProfileConnectionList
      kind="followers"
      followersProfile={followersProfile()}
      {viewerProfileId}
      nextPageError
      onLoadMore={() => {}}
    />
    <ProfileConnectionList
      kind="followers"
      followersProfile={followersProfile(lastPageInfo)}
      additionalProfiles={additionalProfileItems('followers')}
      {viewerProfileId}
      onLoadMore={() => {}}
    />
  </div>
</Story>

<!-- 팔로잉 목록 영역의 상태 전체: 로딩, 오류, 항목 있음, 빈 상태. 팔로워와 같은 구조를 공유한다. -->
<Story name="Following states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfileConnectionList kind="following" loading />
    <ProfileConnectionList kind="following" error onRetry={() => {}} />
    <ProfileConnectionList
      kind="following"
      followingProfile={followingProfile()}
      {viewerProfileId}
      onLoadMore={() => {}}
    />
    <ProfileConnectionList kind="following" />
  </div>
</Story>

<!-- 팔로잉 목록의 pagination 상태: 추가 로드 가능, 로딩, 실패, 마지막 페이지. -->
<Story name="Following pagination states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfileConnectionList
      kind="following"
      followingProfile={followingProfile()}
      {viewerProfileId}
      onLoadMore={() => {}}
    />
    <ProfileConnectionList
      kind="following"
      followingProfile={followingProfile()}
      {viewerProfileId}
      loadingNextPage
      onLoadMore={() => {}}
    />
    <ProfileConnectionList
      kind="following"
      followingProfile={followingProfile()}
      {viewerProfileId}
      nextPageError
      onLoadMore={() => {}}
    />
    <ProfileConnectionList
      kind="following"
      followingProfile={followingProfile(lastPageInfo)}
      additionalProfiles={additionalProfileItems('following')}
      {viewerProfileId}
      onLoadMore={() => {}}
    />
  </div>
</Story>
