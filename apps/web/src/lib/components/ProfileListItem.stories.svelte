<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type { ProfileListItem_profile$key } from '$mearie';

  import ProfileListItem from './ProfileListItem.svelte';

  type FollowState = 'ACCEPTED' | 'PENDING';

  const viewerProfileId = 'viewer-profile';

  // 실제 Mearie fragment ref 대신 표시 필드만 담은 mock 객체를 캐스팅해 넘긴다.
  // (Storybook은 .storybook/mocks의 createFragment가 data getter로 그대로 돌려준다.)
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
      id: 'target-profile',
      displayName: '사용자 이름',
      handle: 'handle@kos.mo',
      bio: null,
      viewerFollow: null,
      ...overrides,
    }) as unknown as ProfileListItem_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileListItem',
    component: ProfileListItem,
    tags: ['autodocs'],
    argTypes: {
      width: {
        control: 'radio',
        options: ['compact', 'wide'],
      },
    },
  });
</script>

<Story
  name="Playground"
  args={{
    profile: profile(),
    viewerProfileId,
    width: 'compact',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4 text-sm">
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">팔로우 가능</p>
      <ProfileListItem profile={profile({ id: 'followable-profile' })} {viewerProfileId} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">팔로잉</p>
      <ProfileListItem
        profile={profile({
          id: 'followed-profile',
          viewerFollow: { id: 'follow-accepted', state: 'ACCEPTED' },
        })}
        {viewerProfileId}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">요청 중</p>
      <ProfileListItem
        profile={profile({
          id: 'pending-profile',
          viewerFollow: { id: 'follow-pending', state: 'PENDING' },
        })}
        {viewerProfileId}
      />
    </section>
  </div>
</Story>

<Story name="Hidden action states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4 text-sm">
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">비로그인 공개 조회 또는 선택 프로필 없음</p>
      <ProfileListItem profile={profile({ id: 'guest-profile' })} viewerProfileId={null} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">본인 프로필</p>
      <ProfileListItem profile={profile({ id: viewerProfileId })} {viewerProfileId} />
    </section>
  </div>
</Story>

<Story name="Edge cases" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    <ProfileListItem
      width="wide"
      {viewerProfileId}
      profile={profile({
        id: 'long-profile',
        displayName: '아주 긴 표시 이름이 들어가서 한 줄을 넘기면 잘려야 한다',
        handle: 'super-long-handle-that-overflows@really-long-instance.example.com',
        bio: '긴 한 줄 소개가 들어가서 컨테이너 폭을 넘기면 말줄임으로 잘려야 한다',
      })}
    />
    <ProfileListItem
      {viewerProfileId}
      profile={profile({ id: 'minimal-profile', displayName: '최소 정보', handle: 'user@kos.moe' })}
    />
  </div>
</Story>
