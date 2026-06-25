<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import TextSkeleton from './TextSkeleton.svelte';

  // 프로필 팔로워/팔로잉 목록 영역. 게시글 목록(PostList)과 같은 상태(로딩/오류/빈) 표현·접근성 패턴을 따른다.
  // 팔로워/팔로잉은 같은 컴포넌트를 `kind`로 분기해 시각/상태 구조를 일치시킨다.
  // 실제 connection 데이터 연결은 후속(PROD-184/185)에서 fragment prop과 항목 목록 분기를 추가한다.
  // 데이터 연결 전에는 항목이 없어 기본적으로 빈 상태를 표시한다.
  type ConnectionKind = 'followers' | 'following';

  type Props = HTMLAttributes<HTMLElement> & {
    kind: ConnectionKind;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  };

  let {
    kind,
    loading = false,
    error = false,
    onRetry,
    class: className,
    ...attributes
  }: Props = $props();

  // 목록 종류별 표시 문구를 컴포넌트 안에 모아 두 라우트가 같은 카피를 공유하게 한다.
  const copy: Record<
    ConnectionKind,
    {
      title: string;
      emptyTitle: string;
      emptyDescription: string;
      errorTitle: string;
      loadingLabel: string;
    }
  > = {
    followers: {
      title: '팔로워',
      emptyTitle: '아직 팔로워가 없어요',
      emptyDescription: '이 프로필을 팔로우하는 사람이 생기면 여기에 표시돼요.',
      errorTitle: '팔로워 목록을 불러오지 못했어요',
      loadingLabel: '팔로워 목록을 불러오는 중입니다.',
    },
    following: {
      title: '팔로잉',
      emptyTitle: '아직 팔로잉이 없어요',
      emptyDescription: '이 프로필이 팔로우하는 사람이 생기면 여기에 표시돼요.',
      errorTitle: '팔로잉 목록을 불러오지 못했어요',
      loadingLabel: '팔로잉 목록을 불러오는 중입니다.',
    },
  };

  const text = $derived(copy[kind]);

  // 첫 화면을 채울 만큼만 반복한다.
  const skeletonItems = [0, 1, 2];
</script>

<section {...attributes} class={className}>
  <h2 class="text-text-primary border-border border-b px-4 pt-2 pb-3 text-base font-bold">
    {text.title}
  </h2>
  {#if loading}
    <div aria-hidden="true">
      {#each skeletonItems as item (item)}
        <div class="border-border flex items-center gap-3 border-b px-4 py-3">
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
    <span class="sr-only" role="status">{text.loadingLabel}</span>
  {:else if error}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">{text.errorTitle}</p>
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
    <!--
      항목 목록 분기는 후속(PROD-184/185)에서 connection fragment prop과 함께 추가한다.
      그 전까지는 표시할 항목이 없으므로 빈 상태를 기본으로 표시한다.
    -->
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">{text.emptyTitle}</p>
      <p class="text-text-secondary mt-1 text-sm">{text.emptyDescription}</p>
    </div>
  {/if}
</section>
