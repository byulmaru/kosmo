<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import PostAuthorProfile from '$lib/components/PostAuthorProfile.svelte';
  import TextSkeleton from '$lib/components/TextSkeleton.svelte';

  // 게시글 디테일 화면. PROD-89 범위는 본문·작성자·작성 시각·상태 처리이며,
  // 답글·반응·리포스트는 범위 밖이다.
  //
  // 파일명 `+page@(tabs).svelte`로 레이아웃을 `(tabs)` 셸까지 리셋한다.
  // 상위 `@[handle]/+layout.svelte`가 모든 하위 라우트에 작성자 ProfileHero를
  // 강제로 렌더하므로, 게시글 디테일은 그 레이아웃을 건너뛰고 사이드바·하단탭만 유지한다.

  const handle = $derived(page.params.handle ?? '');

  // 작성자 영역: 라우트 핸들이 곧 작성자이므로 `profileByHandle`로 실데이터를 가져온다.
  // 로딩·오류·없는 게시글 상태도 이 query에 매핑한다(`@[handle]/+layout.svelte`와 같은 패턴).
  const authorQuery = createQuery(
    graphql(`
      query PostDetailAuthorQuery($handle: String!) {
        profileByHandle(handle: $handle) {
          id
          ...PostAuthorProfile_profile
        }
      }
    `),
    () => ({ handle }),
  );

  const author = $derived(authorQuery.data?.profileByHandle ?? null);

  // PR #67(PROD-92)의 GraphQL `Post`/`PostContent` shape에 맞춘 본문 더미 타입.
  type PostBody = {
    content: { bodyText: string; spoilerText: string | null } | null;
    createdAt: string; // DateTime(ISO)
    state: 'ACTIVE' | 'DELETED';
    visibility: 'PUBLIC' | 'FOLLOWERS' | 'DIRECT';
  };

  // TODO(PROD-110): 단건 조회 query(PROD-93) 머지 후 아래 본문 더미를 createQuery로 교체한다.
  //   const postQuery = createQuery(
  //     graphql(`query PostDetailQuery($id: ID!) {
  //       post(id: $id) { content { bodyText spoilerText } createdAt state visibility }
  //     }`),
  //     () => ({ id: page.params.postId }),
  //   );
  //   const post = $derived(postQuery.data?.post ?? null);
  //
  // 그때 상태 분기에 postQuery.loading/error와 post null을 합류시킨다.
  // 본문 상태별 화면을 확인하려면 아래 더미 값을 임시로 바꾼다.
  const post = $derived<PostBody | null>({
    content: {
      bodyText:
        '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.\n줄바꿈도 그대로 보존됩니다.',
      spoilerText: null,
    },
    createdAt: '2026-04-27T21:14:00.000Z',
    state: 'ACTIVE',
    visibility: 'PUBLIC',
  });

  const visibilityLabel: Record<PostBody['visibility'], string> = {
    PUBLIC: '전체 공개',
    FOLLOWERS: '팔로워 공개',
    DIRECT: '다이렉트',
  };

  const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
  const formattedCreatedAt = $derived(post ? dateFormatter.format(new Date(post.createdAt)) : '');
</script>

<!--
  공유 (tabs) 셸의 main은 `flex items-center px-6 py-8`로 콘텐츠를 세로 중앙 정렬 + 패딩한다.
  게시글 디테일은 피드처럼 상단부터 보여야 하므로 프로필 라우트와 같은 방식으로:
  - self-start 로 탑정렬
  - 음수 마진으로 main 좌우/상단 패딩(px-6 py-8)을 상쇄
    모바일: 풀블리드. 데스크톱: 고정 폭 컬럼.
-->
<section class="-mx-6 -mt-8 w-[calc(100%+3rem)] self-start lg:w-[600px]">
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

  {#if authorQuery.loading}
    <div class="px-4 py-4" aria-hidden="true">
      <div class="flex items-center gap-3">
        <div class="border-border bg-surface size-10 animate-pulse rounded-full border"></div>
        <div class="flex flex-col gap-2">
          <TextSkeleton width="md" />
          <TextSkeleton width="sm" />
        </div>
      </div>
      <div class="mt-4 flex flex-col gap-2.5">
        <TextSkeleton width="full" />
        <TextSkeleton width="full" />
        <TextSkeleton width="lg" />
      </div>
    </div>
    <span class="sr-only" role="status">게시글을 불러오는 중입니다.</span>
  {:else if authorQuery.error}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">게시글을 불러오지 못했어요</p>
      <p class="text-text-secondary mt-1 text-sm">잠시 후 다시 시도해주세요.</p>
      <button
        class="border-border text-text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
        type="button"
        onclick={() => authorQuery.refetch()}
      >
        다시 시도
      </button>
    </div>
  {:else if !author || !post}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">게시글을 찾을 수 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">이미 삭제되었거나 존재하지 않는 게시글이에요.</p>
    </div>
  {:else if post.state === 'DELETED'}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">삭제된 게시글이에요</p>
      <p class="text-text-secondary mt-1 text-sm">작성자가 이 게시글을 삭제했어요.</p>
    </div>
  {:else}
    <article class="px-4 py-4">
      <PostAuthorProfile profile={author} href={`/@${handle}`} />

      {#if post.content}
        <p class="text-text-primary mt-4 text-[17px] break-words whitespace-pre-wrap">
          {post.content.bodyText}
        </p>
      {/if}

      <div class="text-text-secondary mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <time datetime={post.createdAt}>{formattedCreatedAt}</time>
        <span aria-hidden="true">·</span>
        <span>{visibilityLabel[post.visibility]}</span>
      </div>
    </article>
  {/if}
</section>
