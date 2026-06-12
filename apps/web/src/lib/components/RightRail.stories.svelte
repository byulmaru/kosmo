<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import RightRail from './RightRail.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/RightRail',
    component: RightRail,
    parameters: {
      layout: 'padded',
    },
  });
</script>

<Story name="Default" />
