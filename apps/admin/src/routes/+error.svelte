<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>Kosmo Admin Console</title>
</svelte:head>

<main>
  <h1>Kosmo Admin Console</h1>
  <p>{page.status === 404 ? 'Not Found' : 'Admin Console unavailable'}</p>
</main>
