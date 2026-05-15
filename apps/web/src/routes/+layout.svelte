<script lang="ts">
  import './layout.css';
  import { setClient } from '@mearie/svelte';
  import favicon from '$lib/assets/favicon.svg';
  import { client } from '$lib/graphql/client';

  let { children } = $props();

  setClient(client);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="bg-background text-foreground min-h-screen font-sans">
  {@render children()}
</div>
