<script lang="ts">
  import { tv } from '$lib/tv';
  import type { HTMLFormAttributes } from 'svelte/elements';

  type SearchBarProps = Omit<HTMLFormAttributes, 'onsubmit'> & {
    value?: string;
    placeholder?: string;
    onsubmit?: (value: string) => void;
    // tailwind-merge가 받을 수 있도록 class를 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    value = $bindable(''),
    placeholder = '검색어',
    class: className,
    onsubmit,
    ...rest
  }: SearchBarProps = $props();

  const bar = tv({
    base: 'border-border bg-card flex h-[52px] w-[390px] items-center gap-3 border-b px-4',
  });

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    onsubmit?.(value);
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
      class="placeholder:text-text-secondary min-w-0 flex-1 bg-transparent outline-none"
      type="text"
      enterkeyhint="search"
      bind:value
      {placeholder}
      aria-label="검색어"
    />
  </div>
  <button
    class="text-text-secondary grid size-5 place-items-center"
    type="button"
    aria-label="검색 지우기"
    onclick={() => (value = '')}
  >
    ×
  </button>
</form>
