<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    children: Snippet;
  };

  const { children }: Props = $props();
</script>

<div class="border-border border-b">
  <nav class="flex">
    {@render children()}
  </nav>
</div>
