<script lang="ts">
  import '../app.css';
  import { setLanguages } from '$lib/i18n.svelte';

  const { children } = $props();
</script>

{@render children()}
