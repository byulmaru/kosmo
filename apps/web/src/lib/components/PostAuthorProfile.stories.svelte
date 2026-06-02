<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostAuthorProfileView from './PostAuthorProfileView.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/PostAuthorProfile',
    component: PostAuthorProfileView,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{
    displayName: '코스모 작가',
    handle: 'kosmo',
    href: '/@kosmo',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[320px] gap-4">
    <PostAuthorProfileView displayName="코스모 작가" handle="kosmo" />
    <PostAuthorProfileView displayName="fallback 작가" handle="artist" />
    <PostAuthorProfileView
      displayName="정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필"
      handle="very-long-author-handle-that-should-not-break-layout"
    />
    <PostAuthorProfileView displayName="링크 작가" handle="linked" href="/@linked" />
  </div>
</Story>
