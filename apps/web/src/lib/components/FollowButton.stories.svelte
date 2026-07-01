<script module lang="ts">
  import type { FragmentRefs } from '@mearie/svelte';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import FollowButton from './FollowButton.svelte';

  const viewerProfileId = 'viewer-profile';
  const targetProfileId = 'target-profile';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const profile = (
    id: string,
    viewerFollow: { id: string } | null = null,
  ): FragmentRefs<'FollowButton_profile'> =>
    ({
      __typename: 'Profile',
      id,
      viewerFollow,
    }) as unknown as FragmentRefs<'FollowButton_profile'>;

  const { Story } = defineMeta({
    title: 'KOSMO/FollowButton',
    component: FollowButton,
    tags: ['autodocs'],
    argTypes: {
      authenticated: {
        control: 'boolean',
      },
      canMutate: {
        control: 'boolean',
      },
      size: {
        control: 'radio',
        options: ['sm', 'md', 'lg'],
      },
    },
  });
</script>

<Story
  name="Playground"
  args={{
    profile: profile(targetProfileId),
    viewerProfileId,
    authenticated: true,
    canMutate: true,
    size: 'sm',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4 text-sm">
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">팔로우 가능</p>
      <FollowButton profile={profile('followable-profile')} {viewerProfileId} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">팔로잉</p>
      <FollowButton profile={profile('followed-profile', { id: 'follow' })} {viewerProfileId} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">프로필 미선택</p>
      <FollowButton profile={profile('missing-viewer-profile')} viewerProfileId={null} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">비로그인</p>
      <FollowButton profile={profile('guest-profile')} {viewerProfileId} authenticated={false} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">권한 없음</p>
      <FollowButton profile={profile('blocked-profile')} {viewerProfileId} canMutate={false} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">본인 프로필에서는 버튼이 렌더링되지 않음</p>
      <FollowButton profile={profile(viewerProfileId)} {viewerProfileId} />
    </section>
  </div>
</Story>
