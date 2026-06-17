<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type { ProfileListItem_profile$key } from '$mearie';

  import ProfileListItem from './ProfileListItem.svelte';

  // 실제 Mearie fragment ref 대신 표시 필드만 담은 mock 객체를 캐스팅해 넘긴다.
  // (Storybook은 .storybook/mocks의 createFragment가 data getter로 그대로 돌려준다.)
  const profile = (
    overrides: Partial<{ displayName: string; handle: string; bio: string | null }> = {},
  ): ProfileListItem_profile$key =>
    ({
      __typename: 'Profile',
      id: 'story-profile',
      displayName: '사용자 이름',
      handle: 'handle@kos.mo',
      bio: null,
      ...overrides,
    }) as unknown as ProfileListItem_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileListItem',
    component: ProfileListItem,
    tags: ['autodocs'],
    argTypes: {
      state: {
        control: 'radio',
        options: ['follow', 'following'],
      },
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
    state: 'follow',
    width: 'compact',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    <ProfileListItem state="follow" profile={profile()} />
    <ProfileListItem state="following" profile={profile()} />
    <ProfileListItem
      state="follow"
      width="wide"
      profile={profile({ displayName: '코스모 사용자', handle: 'user@kos.moe' })}
    />
    <ProfileListItem
      state="following"
      width="wide"
      profile={profile({ handle: 'user@kos.moe', bio: '한 줄 소개가 들어가는 자리' })}
    />
  </div>
</Story>

<Story name="Edge cases" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    <ProfileListItem
      state="follow"
      width="wide"
      profile={profile({
        displayName: '아주 긴 표시 이름이 들어가서 한 줄을 넘기면 잘려야 한다',
        handle: 'super-long-handle-that-overflows@really-long-instance.example.com',
        bio: '긴 한 줄 소개가 들어가서 컨테이너 폭을 넘기면 말줄임으로 잘려야 한다',
      })}
    />
    <ProfileListItem
      state="follow"
      profile={profile({ displayName: '최소 정보', handle: 'user@kos.moe' })}
    />
  </div>
</Story>
