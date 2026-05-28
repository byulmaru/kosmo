<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type SegmentTab = '모두' | '멘션';

  type SegmentTabsProps = HTMLAttributes<HTMLDivElement> & {
    active?: SegmentTab;
  };

  let { active = '모두', class: className = '', ...rest }: SegmentTabsProps = $props();

  const tabs: SegmentTab[] = ['모두', '멘션'];
</script>

<div
  {...rest}
  class={`border-border bg-card grid h-14 w-[390px] grid-cols-2 border-b ${className}`}
  role="tablist"
  aria-label="알림 유형"
>
  {#each tabs as tab}
    {@const selected = tab === active}
    <button
      class={`relative text-sm font-semibold ${selected ? 'text-text-primary' : 'text-text-secondary'}`}
      type="button"
      role="tab"
      aria-selected={selected}
    >
      {tab}
      {#if selected}
        <span class="bg-text-primary absolute right-[60px] bottom-0 left-[60px] h-0.5 rounded-full"
        ></span>
      {/if}
    </button>
  {/each}
</div>
