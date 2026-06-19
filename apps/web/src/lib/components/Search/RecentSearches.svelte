<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  // 입력 중(검색바 포커스) 단계에서 최근 검색어를 노출한다.
  // 항목/삭제 버튼은 onmousedown preventDefault로 입력 포커스를 잃지 않게 해, 클릭이 먼저 처리되게 한다.
  type Props = Omit<HTMLAttributes<HTMLElement>, 'onselect'> & {
    terms: string[];
    onselect: (term: string) => void;
    onremove: (term: string) => void;
  };

  let { terms, onselect, onremove, class: className, ...rest }: Props = $props();
</script>

<section {...rest} class={className}>
  {#if terms.length > 0}
    <p class="text-text-secondary px-4 pt-3 pb-1 text-xs font-semibold">최근 검색</p>
    <ul>
      {#each terms as term (term)}
        <li class="border-border flex items-center border-b">
          <button
            class="text-text-primary flex min-h-12 flex-1 items-center gap-2 px-4 text-sm"
            type="button"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => onselect(term)}
          >
            <svg
              class="text-text-secondary size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 7v5l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" />
            </svg>
            <span class="truncate">{term}</span>
          </button>
          <button
            class="text-text-secondary grid size-10 shrink-0 place-items-center"
            type="button"
            aria-label={`최근 검색 '${term}' 삭제`}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => onremove(term)}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="px-4 py-12 text-center">
      <p class="text-text-secondary text-sm">최근 검색 내역이 없어요.</p>
    </div>
  {/if}
</section>
