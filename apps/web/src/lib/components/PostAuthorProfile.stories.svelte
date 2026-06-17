<script module lang="ts">
  import type { FragmentRefs } from '@mearie/svelte';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostAuthorProfile from './PostAuthorProfile.svelte';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const profile = (
    displayName: string,
    handle: string,
  ): FragmentRefs<'PostAuthorProfile_profile'> =>
    ({
      __typename: 'Profile',
      displayName,
      handle,
    }) as unknown as FragmentRefs<'PostAuthorProfile_profile'>;

  const { Story } = defineMeta({
    title: 'KOSMO/PostAuthorProfile',
    component: PostAuthorProfile,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{
    profile: profile('코스모 작가', 'kosmo'),
    href: '/@kosmo',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[320px] gap-4">
    <PostAuthorProfile profile={profile('코스모 작가', 'kosmo')} />
    <PostAuthorProfile profile={profile('fallback 작가', 'artist')} />
    <PostAuthorProfile
      profile={profile(
        '정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필',
        'very-long-author-handle-that-should-not-break-layout',
      )}
    />
    <PostAuthorProfile profile={profile('링크 작가', 'linked')} href="/@linked" />
  </div>
</Story>
