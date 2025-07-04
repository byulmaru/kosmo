<script lang="ts">
  import { setLanguages } from '$lib/i18n.svelte';
  const { children, data } = $props();
  import '../app.css';

  setLanguages(data.languages);
  console.log(data.languages);
</script>

{@render children()}
