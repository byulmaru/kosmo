<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import TextSkeleton from './TextSkeleton.svelte';

  // 프로필 게시글 목록 영역의 로딩 스켈레톤과 빈 상태(PROD-123).
  // 목록 query(PROD-120)가 아직 없어 fragment 없는 프레젠테이션 컴포넌트로 시작한다.
  // TODO(PROD-124): 목록 fragment를 선언하고 게시글 아이템 렌더링·오류 상태를 추가한다.
  type Props = HTMLAttributes<HTMLElement> & {
    loading?: boolean;
  };

  let { loading = false, class: className, ...attributes }: Props = $props();

  // 첫 화면을 채울 만큼만 반복한다.
  const skeletonItems = [0, 1, 2];
</script>

<section {...attributes} class={className}>
  {#if loading}
    <div aria-hidden="true">
      {#each skeletonItems as item (item)}
        <div class="flex items-start gap-3 px-4 py-4">
          <div class="w-10 shrink-0">
            <div class="border-border bg-surface size-10 animate-pulse rounded-full border"></div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-col gap-2">
              <TextSkeleton width="md" />
              <TextSkeleton width="sm" />
            </div>
            <!-- 실제 게시글(이름 블록 아래 본문이 컬럼 폭으로 흐르는 형태)에 가깝도록
                 본문 줄은 컨테이너 폭을 가득 채운다. -->
            <div class="mt-3 flex flex-col gap-2.5">
              <TextSkeleton width="stretch" />
              <TextSkeleton width="stretch" />
              <TextSkeleton width="lg" />
            </div>
          </div>
        </div>
      {/each}
    </div>
    <span class="sr-only" role="status">게시글 목록을 불러오는 중입니다.</span>
  {:else}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">아직 게시글이 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">첫 게시글이 올라오면 여기에 표시돼요.</p>
    </div>
  {/if}
</section>
