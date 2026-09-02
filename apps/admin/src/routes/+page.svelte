<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Kosmo Admin Console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<main>
  <h1>Kosmo Admin Console</h1>
  <p>{data.viewer.label}</p>
  {#if data.viewer.login && data.viewer.login !== data.viewer.label}
    <p>{data.viewer.login}</p>
  {/if}
</main>
