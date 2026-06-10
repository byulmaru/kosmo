<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import ProfilePostList from './ProfilePostList.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/ProfilePostList',
    component: ProfilePostList,
    tags: ['autodocs'],
  });
</script>

<Story name="Playground" args={{ loading: true }} />

<!-- 프로필 페이지 목록 영역의 상태 전체: 로딩 스켈레톤, 게시글 없음 빈 상태. -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfilePostList loading />
    <ProfilePostList />
  </div>
</Story>
