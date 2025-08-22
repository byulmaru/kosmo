<script lang="ts">
  import PageHeader from '$lib/components/header/DefaultHeader.svelte';
  import { Button } from '$lib/components/ui/button';
</script>

<PageHeader showBackButton={false} title="홈" />

<div class="p-4">
  <h1 class="text-4xl font-bold">Web</h1>
  <Button>안녕</Button>
  <p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
</div>
