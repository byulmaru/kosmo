<script lang="ts">
  import { tv } from '$lib/tv';
  import type { HTMLFormAttributes } from 'svelte/elements';

  // 네이티브 onfocus/onblur와 충돌하지 않게 Omit 후 콜백으로 재정의한다.
  type SearchBarProps = Omit<HTMLFormAttributes, 'onsubmit' | 'onfocus' | 'onblur'> & {
    value?: string;
    placeholder?: string;
    onsubmit?: (value: string) => void;
    onfocus?: () => void;
    onblur?: () => void;
    // tailwind-merge가 받을 수 있도록 class를 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    value = $bindable(''),
    placeholder = '검색어',
    class: className,
    onsubmit,
    onfocus,
    onblur,
    ...rest
  }: SearchBarProps = $props();

  let inputElement: HTMLInputElement | undefined = $state();

  // 페이지가 최근 검색 선택/제출 후 입력 포커스를 거둘 수 있게 한다.
  export function blurInput() {
    inputElement?.blur();
  }

  const bar = tv({
    base: 'border-border bg-card flex h-[52px] w-[390px] items-center gap-3 border-b px-4',
  });

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    onsubmit?.(value);
    inputElement?.blur();
  };
</script>

<form {...rest} class={bar({ class: className })} role="search" onsubmit={handleSubmit}>
  <div
    class="bg-surface text-text-primary flex h-9 flex-1 items-center gap-2 rounded-full px-4 text-xs"
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
      onfocus={() => onfocus?.()}
      onblur={() => onblur?.()}
    />
  </div>
  <button
    class="text-text-secondary grid size-5 place-items-center"
    type="button"
    aria-label="검색 지우기"
    onmousedown={(event) => event.preventDefault()}
    onclick={() => (value = '')}
  >
    ×
  </button>
</form>
