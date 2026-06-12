<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import RightRail from './RightRail.svelte';
  import type { RightRail_profile$key } from '$mearie';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const profile = {
    __typename: 'Profile',
    id: 'profile-1',
    displayName: '코스모 작가',
    handle: 'kosmo',
  } as unknown as RightRail_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/RightRail',
    component: RightRail,
    parameters: {
      layout: 'padded',
    },
  });
</script>

<Story
  name="Default"
  args={{
    profile,
  }}
/>
