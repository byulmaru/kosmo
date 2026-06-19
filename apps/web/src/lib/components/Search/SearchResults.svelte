<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import TextSkeleton from '../TextSkeleton.svelte';

  // 사람(프로필) 탭의 검색 상태 영역.
  // 실제 검색 query 연결과 결과 목록(ProfileListItem) 렌더는 PROD-154에서 한다.
  // TODO(PROD-154): profileByHandle createQuery를 연결해 loading/error를 query 상태로 바꾸고,
  // 결과 있음 분기에서 ProfileListItem 목록을, 결과 없음에서 아래 empty 상태를 렌더한다.
  type Props = HTMLAttributes<HTMLElement> & {
    query?: string;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  };

  let {
    query = '',
    loading = false,
    error = false,
    onRetry,
    class: className,
    ...attributes
  }: Props = $props();

  const hasQuery = $derived(query.trim().length > 0);

  // 첫 화면을 채울 만큼만 반복한다.
  const skeletonItems = [0, 1, 2];
</script>

<section {...attributes} class={className}>
  {#if !hasQuery}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">프로필을 검색해보세요</p>
      <p class="text-text-secondary mt-1 text-sm">
        handle을 입력하면 일치하는 프로필을 찾아드려요.
      </p>
    </div>
  {:else if loading}
    <div aria-hidden="true">
      {#each skeletonItems as item (item)}
        <div class="border-border flex min-h-16 items-center gap-3 border-b px-4">
          <div
            class="border-border bg-surface size-10 shrink-0 animate-pulse rounded-full border"
          ></div>
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <TextSkeleton width="md" />
            <TextSkeleton width="sm" />
          </div>
        </div>
      {/each}
    </div>
    <span class="sr-only" role="status">검색 결과를 불러오는 중입니다.</span>
  {:else if error}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">검색 결과를 불러오지 못했어요</p>
      <p class="text-text-secondary mt-1 text-sm">잠시 후 다시 시도해주세요.</p>
      {#if onRetry}
        <button
          class="border-border text-text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
          type="button"
          onclick={onRetry}
        >
          다시 시도
        </button>
      {/if}
    </div>
  {:else}
    <!-- TODO(PROD-154): 결과가 있으면 ProfileListItem 목록을 이 분기 위에서 렌더한다. -->
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">검색 결과가 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">'{query}'에 해당하는 프로필을 찾지 못했어요.</p>
    </div>
  {/if}
</section>
