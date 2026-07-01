<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import FollowButton from './FollowButton.svelte';
  import ProfileHero from './ProfileHero.svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { FollowButton_profile$key } from '$mearie';

  // 스토리북은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  type ProfileRef = FragmentRefs<'ProfileHero_profile'>;
  const sampleProfile = {
    handle: 'user',
    relativeHandle: '@user@kos.moe',
    displayName: '표시 이름',
    bio: '본문 한 줄이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어나요.',
    followersCount: 128,
    followingCount: 1234,
  } as unknown as ProfileRef;

  const noBioProfile = {
    ...(sampleProfile as unknown as Record<string, unknown>),
    bio: null,
  } as unknown as ProfileRef;

  // 라우트가 hero action 슬롯에 넣는 팔로우 버튼 예시. 버튼 정책은 FollowButton의 Profile.viewerState가 판단한다.
  const followTarget = {
    __typename: 'Profile',
    id: 'target-profile',
    viewerState: {
      authenticated: true,
      hasSelectedProfile: true,
      isSelf: false,
      canMutate: true,
      follow: null,
    },
  } as unknown as FollowButton_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileHero',
    component: ProfileHero,
    parameters: {
      layout: 'fullscreen',
    },
  });
</script>

<Story name="Default" args={{ profile: sampleProfile }} />
<Story name="No bio" args={{ profile: noBioProfile }} />
<Story name="Loading" args={{ loading: true }} />
<Story
  name="Remote handle"
  args={{
    profile: {
      ...(sampleProfile as unknown as Record<string, unknown>),
      displayName: '먼 인스턴스 사용자',
      handle: 'user',
      relativeHandle: '@user@remote.example',
    } as unknown as ProfileRef,
  }}
/>
<Story name="With action" asChild>
  <ProfileHero profile={sampleProfile}>
    {#snippet action()}
      <FollowButton profile={followTarget} />
    {/snippet}
  </ProfileHero>
</Story>
