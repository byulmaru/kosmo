<script lang="ts">
  import PostList from '$lib/components/PostList.svelte';

  // 프로필 게시글 목록 영역 골격(PROD-123). 목록 query(PROD-120)가 아직 없어
  // 더미 상수가 상태 분기를 공급하며, 실쿼리 결과와 같은 모양으로 둔다.
  //
  // TODO(PROD-124): PROD-120 머지 후 아래 더미를 목록 createQuery로 교체한다.
  // 그때 loading은 query.loading에, 빈 상태는 빈 목록에 1:1 매핑되고
  // 게시글 아이템·오류 상태 렌더링이 추가된다. 빈 상태는 페이지 기본값으로는
  // 도달하지 않는 선제 구현이며 Storybook `KOSMO/PostList`에서 확인한다.
  const postsLoading = true;
</script>

<PostList loading={postsLoading} />
