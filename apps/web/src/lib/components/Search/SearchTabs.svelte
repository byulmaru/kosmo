<script module lang="ts">
  import { type SearchTab } from '@kosmo/core/search';

  // 탭 slug → 표시 라벨. slug는 core의 source of truth이고, 한글 라벨은 표시 전용이라 프론트에 둔다.
  export const SEARCH_TAB_LABELS: Record<SearchTab, string> = {
    popular: '인기',
    latest: '최신',
    media: '미디어',
    people: '사람',
  };
</script>

<script lang="ts">
  import { DEFAULT_SEARCH_TAB, SEARCH_TABS } from '@kosmo/core/search';
  import { tv } from '$lib/tv';
  import type { HTMLAttributes } from 'svelte/elements';

  // 네이티브 onselect(텍스트 선택 이벤트)와 충돌하지 않게 Omit 후 콜백으로 재정의한다.
  type SearchTabsProps = Omit<HTMLAttributes<HTMLDivElement>, 'onselect'> & {
    active?: SearchTab;
    onselect?: (tab: SearchTab) => void;
    // tailwind-merge가 받을 수 있도록 class를 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    active = DEFAULT_SEARCH_TAB,
    class: className,
    onselect,
    ...rest
  }: SearchTabsProps = $props();

  const tablist = tv({
    base: 'border-border bg-card grid h-[39px] w-[390px] grid-cols-4 border-b',
  });
</script>

<div {...rest} class={tablist({ class: className })} role="tablist" aria-label="검색 결과 유형">
  {#each SEARCH_TABS as tab}
    {@const selected = tab === active}
    <button
      class={`relative text-xs font-semibold ${selected ? 'text-text-primary' : 'text-text-secondary'}`}
      type="button"
      role="tab"
      aria-selected={selected}
      onclick={() => onselect?.(tab)}
    >
      {SEARCH_TAB_LABELS[tab]}
      {#if selected}
        <span class="bg-text-primary absolute inset-x-8 bottom-0 h-0.5 rounded-full"></span>
      {/if}
    </button>
  {/each}
</div>
