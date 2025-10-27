<script lang="ts">
  import { mode } from 'mode-watcher';
  import { Toaster as Sonner } from 'svelte-sonner';
  import type { ToasterProps as SonnerProps } from 'svelte-sonner';

  let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
  style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
  class="toaster group"
  theme={mode.current}
  {...restProps}
/>
