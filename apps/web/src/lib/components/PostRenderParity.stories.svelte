<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostLayout from './PostLayout.svelte';
  import PostListItem from './PostListItem.svelte';

  import type { PostLayout_post$key, PostListItem_post$key } from '$mearie';

  import { makePost, postBodyCases } from '$lib/stories/postFixtures';

  // 목록(PostListItem)·상세(PostLayout)를 같은 fixture로 나란히 렌더해 본문 렌더 규칙이 일치하는지
  // (문단 간격·빈 문단·긴 단어 wrapping·빈 본문 비렌더) 회귀 비교한다. 의도된 차이는 본문 크기
  // (목록 md 16px / 상세 lg 20px), 아바타(48/40), 작성 시각 위치(헤더 우측 / 본문 아래)뿐이다(PROD-173).
  // Storybook이 createFragment를 passthrough로 모킹하므로 superset 객체를 각 fragment ref로 캐스팅한다.
  const asListItem = (index: number) =>
    makePost(postBodyCases[index], {
      id: `parity-list-${index}`,
    }) as unknown as PostListItem_post$key;
  const asLayout = (index: number) =>
    makePost(postBodyCases[index], {
      id: `parity-detail-${index}`,
    }) as unknown as PostLayout_post$key;

  const { Story } = defineMeta({
    title: 'KOSMO/Post/List vs Detail 패리티',
    component: PostListItem,
  });
</script>

<!-- 같은 본문 문서를 목록·상세 컨테이너에 나란히 렌더한다. 본문 규칙(문단 간격·빈 문단·긴 단어
     wrapping·빈 본문)은 좌우가 같아야 하고, 의도된 차이(본문 크기 md/lg·아바타·시각 위치)만 남는다. -->
<Story name="본문 렌더 패리티" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid grid-cols-[390px_600px] items-start gap-x-8 gap-y-8">
    <div class="text-text-secondary text-sm font-bold">목록(feed · 본문 md 16px)</div>
    <div class="text-text-secondary text-sm font-bold">상세(detail · 본문 lg 20px)</div>

    {#each postBodyCases as bodyCase, index (bodyCase.label)}
      <div class="self-start">
        <div class="text-text-secondary text-xsm mb-1">{bodyCase.label}</div>
        <PostListItem post={asListItem(index)} />
      </div>
      <div class="self-start px-4 py-4">
        <div class="text-text-secondary text-xsm mb-1">{bodyCase.label}</div>
        <PostLayout post={asLayout(index)} />
      </div>
    {/each}
  </div>
</Story>
