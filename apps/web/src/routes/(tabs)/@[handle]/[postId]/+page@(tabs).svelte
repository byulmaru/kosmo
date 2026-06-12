<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import PostAuthorProfile from '$lib/components/PostAuthorProfile.svelte';
  import PostBody from '$lib/components/PostBody.svelte';
  import TextSkeleton from '$lib/components/TextSkeleton.svelte';

  // 게시글 디테일 화면. PROD-89 범위는 본문·작성자·작성 시각·상태 처리이며,
  // 답글·반응·리포스트는 범위 밖이다.
  //
  // 파일명 `+page@(tabs).svelte`로 레이아웃을 `(tabs)` 셸까지 리셋한다.
  // 상위 `@[handle]/+layout.svelte`가 모든 하위 라우트에 작성자 ProfileHero를
  // 강제로 렌더하므로, 게시글 디테일은 그 레이아웃을 건너뛰고 사이드바·하단탭만 유지한다.

  const handle = $derived(page.params.handle ?? '');
  const postId = $derived(page.params.postId ?? '');

  // 게시글은 `Post`가 `Node`를 구현하므로 별도 query 없이 `node(id)` 단건 조회로 가져온다
  // (PROD-93 범위 변경). 작성자도 `post.profile`에서 함께 가져와 URL 핸들에 의존하지 않는다.
  const postQuery = createQuery(
    graphql(`
      query PostDetailQuery($postId: ID!) {
        node(id: $postId) {
          __typename
          ... on Post {
            id
            state
            profile {
              id
              handle
              ...PostAuthorProfile_profile
            }
            ...PostBody_post
          }
        }
      }
    `),
    () => ({ postId }),
  );

  // 없는 게시글뿐 아니라 다른 타입의 Node ID로 접근한 경우도 "없음"으로 본다.
  const post = $derived(postQuery.data?.node?.__typename === 'Post' ? postQuery.data.node : null);

  // URL 핸들이 실제 작성자 핸들과 다르면(작성자의 핸들 변경 후 옛 URL, 위조 핸들 URL)
  // 정식 URL로 정규화한다. postId가 source of truth이므로 게시글은 그대로 두고
  // 주소만 replaceState로 바꿔 히스토리에 잘못된 핸들이 남지 않게 한다.
  $effect(() => {
    if (post && post.profile.handle !== handle) {
      void goto(`/@${post.profile.handle}/${postId}`, { replaceState: true });
    }
  });
</script>

<!--
  공유 (tabs) 셸의 main은 `flex items-center px-6 py-8`로 콘텐츠를 세로 중앙 정렬 + 패딩한다.
  게시글 디테일은 피드처럼 상단부터 보여야 하므로 프로필 라우트와 같은 방식으로:
  - self-start 로 탑정렬
  - 음수 마진으로 main 좌우/상단 패딩(px-6 py-8)을 상쇄
    폭은 항상 중앙 컬럼 트랙을 가득 채운다(최대 폭 600px은 공유 셸 그리드가 결정).
-->
<section class="-mx-6 -mt-8 w-[calc(100%+3rem)] self-start">
  <header
    class="border-border bg-bg/95 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur"
  >
    <button
      class="text-text-primary -ml-2 inline-grid size-9 place-items-center rounded-full"
      type="button"
      aria-label="뒤로 가기"
      onclick={() => history.back()}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 5l-7 7 7 7"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <h1 class="text-text-primary text-lg font-bold">게시글</h1>
  </header>

  {#if postQuery.loading}
    <div class="flex items-start gap-3 px-4 py-4" aria-hidden="true">
      <div class="w-10 shrink-0">
        <div class="border-border bg-surface size-10 animate-pulse rounded-full border"></div>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-col gap-2">
          <TextSkeleton width="md" />
          <TextSkeleton width="sm" />
        </div>
        <div class="mt-4 flex flex-col gap-2.5">
          <TextSkeleton width="full" />
          <TextSkeleton width="full" />
          <TextSkeleton width="lg" />
        </div>
      </div>
    </div>
    <span class="sr-only" role="status">게시글을 불러오는 중입니다.</span>
  {:else if postQuery.error}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">게시글을 불러오지 못했어요</p>
      <p class="text-text-secondary mt-1 text-sm">잠시 후 다시 시도해주세요.</p>
      <button
        class="border-border text-text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
        type="button"
        onclick={() => postQuery.refetch()}
      >
        다시 시도
      </button>
    </div>
  {:else if !post}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">게시글을 찾을 수 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">이미 삭제되었거나 존재하지 않는 게시글이에요.</p>
    </div>
    <!--
      삭제됨 분기는 현재 백엔드 node loader가 ACTIVE 게시글만 반환해 실쿼리로는 도달하지
      않는다(삭제 게시글은 null → 위 "없음" 분기). 백엔드가 삭제 상태를 구분해 노출하는
      PROD-121 대비로 분기만 선제 유지한다.
    -->
  {:else if post.state === 'DELETED'}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">삭제된 게시글이에요</p>
      <p class="text-text-secondary mt-1 text-sm">작성자가 이 게시글을 삭제했어요.</p>
    </div>
  {:else}
    <article class="px-4 py-4">
      <PostAuthorProfile profile={post.profile} href={`/@${post.profile.handle}`}>
        <PostBody class="mt-1.5" {post} />
      </PostAuthorProfile>
    </article>
  {/if}
</section>
