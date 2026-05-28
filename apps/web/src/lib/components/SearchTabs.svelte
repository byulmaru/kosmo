<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type SearchTab = '인기' | '최신' | '미디어' | '사람';

  type SearchTabsProps = HTMLAttributes<HTMLDivElement> & {
    active?: SearchTab;
  };

  let { active = '인기', class: className = '', ...rest }: SearchTabsProps = $props();

  const tabs: SearchTab[] = ['인기', '최신', '미디어', '사람'];
</script>

<div
  {...rest}
  class={`border-border bg-card grid h-[39px] w-[390px] grid-cols-4 border-b ${className}`}
  role="tablist"
  aria-label="검색 결과 유형"
>
  {#each tabs as tab}
    {@const selected = tab === active}
    <button
      class={`relative text-xs font-semibold ${selected ? 'text-text-primary' : 'text-text-secondary'}`}
      type="button"
      role="tab"
      aria-selected={selected}
    >
      {tab}
      {#if selected}
        <span class="bg-text-primary absolute inset-x-8 bottom-0 h-0.5 rounded-full"></span>
      {/if}
    </button>
  {/each}
</div>
