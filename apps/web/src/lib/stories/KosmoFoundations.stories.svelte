<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import KosmoFoundations from './KosmoFoundations.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/Foundations',
    component: KosmoFoundations,
    parameters: {
      layout: 'fullscreen',
    },
  });
</script>

<Story name="Tokens and component map" />
