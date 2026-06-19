<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  // 입력 중(검색바 포커스) 단계에서 최근 검색어를 노출한다.
  // 항목 선택은 검색 URL <a href>로 두어 키보드 Enter·마우스·새 탭 열기가 모두 동작하고,
  // 삭제(×)는 URL 이동이 아니라 로컬(localStorage) 동작이라 버튼으로 둔다.
  type Props = HTMLAttributes<HTMLElement> & {
    terms: string[];
    hrefFor: (term: string) => string;
    onremove: (term: string) => void;
  };

  let { terms, hrefFor, onremove, class: className, ...rest }: Props = $props();
</script>

<section {...rest} class={className}>
  <p class="text-text-secondary px-4 pt-3 pb-1 text-xs font-semibold">최근 검색</p>
  <ul>
    {#each terms as term (term)}
      <li class="border-border flex items-center border-b">
        <a
          class="text-text-primary flex min-h-12 flex-1 items-center gap-2 px-4 text-sm"
          href={hrefFor(term)}
          data-sveltekit-noscroll
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
        </a>
        <button
          class="text-text-secondary flex size-10 shrink-0 items-center justify-center"
          type="button"
          aria-label={`최근 검색 '${term}' 삭제`}
          onclick={() => onremove(term)}
        >
          ×
        </button>
      </li>
    {:else}
      <li class="px-4 py-12 text-center">
        <p class="text-text-secondary text-sm">아직 최근 검색이 없어요.</p>
      </li>
    {/each}
  </ul>
</section>
