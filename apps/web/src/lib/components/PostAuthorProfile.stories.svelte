<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostAuthorProfile from './PostAuthorProfile.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/PostAuthorProfile',
    component: PostAuthorProfile,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{
    displayName: '코스모 작가',
    handle: 'kosmo',
    avatarUrl: '',
    href: '/@kosmo',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[320px] gap-4">
    <PostAuthorProfile displayName="코스모 작가" handle="kosmo" />
    <PostAuthorProfile
      displayName="이미지가 있는 작가"
      handle="artist"
      avatarUrl="https://placehold.co/96x96/fce79a/111111?text=K"
    />
    <PostAuthorProfile
      displayName="정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필"
      handle="very-long-author-handle-that-should-not-break-layout"
    />
    <PostAuthorProfile displayName="링크 작가" handle="linked" href="/@linked" />
  </div>
</Story>
