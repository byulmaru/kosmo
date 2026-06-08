<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = HTMLButtonAttributes & {
    selected?: boolean;
    children: Snippet;
  };

  let {
    selected = false,
    children,
    class: className = '',
    type = 'button',
    ...rest
  }: Props = $props();
</script>

<button
  {...rest}
  {type}
  role="option"
  aria-selected={selected}
  class={`text-text-primary flex w-full items-start gap-2 rounded-sm px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-more ${selected ? 'bg-primary/45' : 'bg-card'} ${className}`}
>
  {@render children()}
</button>
