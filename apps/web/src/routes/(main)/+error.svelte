<script lang="ts">
  import { page } from '$app/state';
  import DefaultHeader from '$lib/components/header/DefaultHeader.svelte';
  import { i18n } from '$lib/i18n.svelte';
</script>

<DefaultHeader />
<h1 class="my-10 text-center text-2xl">{$i18n(page.error?.message)}</h1>
