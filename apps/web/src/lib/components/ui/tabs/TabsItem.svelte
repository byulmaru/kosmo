<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    href: string;
    active?: boolean;
    children: Snippet;
  };

  const { href, active = false, children }: Props = $props();
</script>

<a
  class="hover:text-foreground relative flex-1 px-4 py-4 text-center text-sm font-medium transition-colors {active
    ? 'text-foreground'
    : 'text-muted-foreground'}"
  {href}
>
  {@render children()}
  {#if active}
    <div class="bg-primary absolute bottom-0 left-0 right-0 h-0.5"></div>
  {/if}
</a>
