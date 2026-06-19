<script lang="ts">
  import { tv } from '$lib/tv';
  import type { HTMLFormAttributes } from 'svelte/elements';

  // 네이티브 onsubmit과 충돌하지 않게 Omit 후 콜백으로 재정의한다(검색어 문자열을 넘긴다).
  // 포커스 추적은 검색 페이지가 검색 영역(검색바+최근 검색)에 focus-within으로 처리하므로
  // 여기서는 onfocus/onblur 콜백을 두지 않는다.
  type SearchBarProps = Omit<HTMLFormAttributes, 'onsubmit'> & {
    value?: string;
    placeholder?: string;
    // 검색 전이 아닐 때(입력 중·검색 후) 좌측 뒤로가기(←)를 노출한다.
    showBack?: boolean;
    onsubmit?: (value: string) => void;
    onback?: () => void;
    onclear?: () => void;
    // tailwind-merge가 받을 수 있도록 class를 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    value = $bindable(''),
    placeholder = '검색어',
    showBack = false,
    class: className,
    onsubmit,
    onback,
    onclear,
    ...rest
  }: SearchBarProps = $props();

  let inputElement: HTMLInputElement | undefined = $state();

  // 페이지가 최근 검색 선택/제출 후 입력 포커스를 거둘 수 있게 한다.
  export function blurInput() {
    inputElement?.blur();
  }

  const bar = tv({
    base: 'border-border bg-card flex h-14 w-[390px] items-center gap-3 border-b px-4',
  });

  // 포커스 해제는 페이지가 URL 갱신을 마친 뒤 blurInput()으로 처리한다(단계 깜빡임 방지).
  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    onsubmit?.(value);
  };

  // 지우기: 입력값을 비우고 포커스를 유지(입력 중)한다. 페이지는 onclear에서 URL q를 정리한다.
  const handleClear = () => {
    value = '';
    inputElement?.focus();
    onclear?.();
  };
</script>

<form {...rest} class={bar({ class: className })} role="search" onsubmit={handleSubmit}>
  {#if showBack}
    <!-- 입력 중·검색 후에만 노출. 포커스를 빼앗지 않도록 mousedown을 막고 onback에서 처리한다. -->
    <button
      class="text-text-secondary flex size-5 shrink-0 items-center justify-center"
      type="button"
      aria-label="뒤로"
      onmousedown={(event) => event.preventDefault()}
      onclick={() => onback?.()}
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
    </button>
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
        onmousedown={(event) => event.preventDefault()}
        onclick={handleClear}
      >
        ×
      </button>
    {/if}
  </div>
</form>
