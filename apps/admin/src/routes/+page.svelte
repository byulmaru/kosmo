<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Kosmo Admin Console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<main class="admin-page">
  <header class="admin-header">
    <div>
      <p class="admin-eyebrow">Admin Console</p>
      <h1>Kosmo Admin Console</h1>
      <p class="admin-description">{data.viewer.label}</p>
      {#if data.viewer.login && data.viewer.login !== data.viewer.label}
        <p class="admin-description">{data.viewer.login}</p>
      {/if}
    </div>
    <nav aria-label="Admin Console navigation" class="admin-actions">
      <Button href="/accounts">Accounts</Button>
    </nav>
  </header>
</main>
