<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type SearchBarProps = HTMLAttributes<HTMLDivElement> & {
    query?: string;
  };

  let { query = '검색어', class: className = '', ...rest }: SearchBarProps = $props();
</script>

<div
  {...rest}
  class={`border-border bg-card flex h-[52px] w-[390px] items-center gap-3 border-b px-4 ${className}`}
>
  <div
    class="bg-surface text-text-primary flex h-9 flex-1 items-center gap-2 rounded-full px-4 text-xs"
  >
    <svg
      class="text-text-secondary size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
    <span class="truncate">{query}</span>
  </div>
  <button
    class="text-text-secondary grid size-5 place-items-center"
    type="button"
    aria-label="검색 지우기"
  >
    ×
  </button>
</div>
