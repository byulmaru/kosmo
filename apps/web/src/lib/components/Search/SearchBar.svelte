<script lang="ts">
  import { tv } from '$lib/tv';
  import type { HTMLAttributes } from 'svelte/elements';

  // 표시 전용 검색 입력. 검색 제출은 이 컴포넌트를 감싸는 페이지의 네이티브 GET 폼이 처리한다
  // (입력에 name="q"를 주어 폼이 직렬화). 포커스 추적도 페이지가 focus-within으로 한다.
  type SearchBarProps = HTMLAttributes<HTMLDivElement> & {
    value?: string;
    placeholder?: string;
    // 검색 전이 아닐 때(입력 중·검색 후) 좌측 뒤로가기(←) 링크가 가리킬 검색 전 URL. 없으면 ←를 숨긴다.
    backHref?: string;
    onclear?: () => void;
    // tailwind-merge가 받을 수 있도록 class를 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    value = $bindable(''),
    placeholder = '검색어',
    backHref,
    class: className,
    onclear,
    ...rest
  }: SearchBarProps = $props();

  let inputElement: HTMLInputElement | undefined = $state();

  const bar = tv({
    base: 'border-border bg-card flex h-14 w-[390px] items-center gap-3 border-b px-4',
  });

  // 지우기: 입력값을 비우고 포커스를 유지(입력 중)한다. 페이지는 onclear에서 URL q를 정리한다.
  const handleClear = () => {
    value = '';
    inputElement?.focus();
    onclear?.();
  };
</script>

<div {...rest} class={bar({ class: className })} role="search">
  {#if backHref}
    <!-- 입력 중·검색 후에만 노출. 네이티브 링크라 검색 전(q 없음) URL로 이동해 검색 전 단계로 돌아간다. -->
    <a
      class="text-text-secondary flex size-5 shrink-0 items-center justify-center"
      href={backHref}
      aria-label="뒤로"
      data-sveltekit-noscroll
    >
      <svg
        class="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </a>
  {/if}
  <div
    class="bg-surface text-text-primary group flex h-11 flex-1 items-center gap-2 rounded-full px-4 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-more"
  >
    <svg
      class="text-text-secondary group-focus-within:text-more size-5 shrink-0 transition-colors"
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
    <input
      bind:this={inputElement}
      class="placeholder:text-text-secondary min-w-0 flex-1 bg-transparent outline-none"
      type="text"
      name="q"
      enterkeyhint="search"
      bind:value
      {placeholder}
      aria-label="검색어"
    />
    {#if value}
      <!-- 입력이 있을 때만 노출. 포커스를 유지한 채 값만 비운다. -->
      <button
        class="text-text-secondary flex size-5 shrink-0 items-center justify-center"
        type="button"
        aria-label="검색 지우기"
        onclick={handleClear}
      >
        ×
      </button>
    {/if}
  </div>
</div>
