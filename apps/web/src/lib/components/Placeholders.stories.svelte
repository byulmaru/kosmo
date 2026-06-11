<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import BlockPlaceholder from './BlockPlaceholder.svelte';
  import ImagePlaceholder from './ImagePlaceholder.svelte';
  import TextSkeleton from './TextSkeleton.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/Placeholders',
    component: ImagePlaceholder,
  });
</script>

<script lang="ts">
  const ratios = ['1:1', '4:3', '16:9'] as const;
  const widths = ['stretch', 'full', 'lg', 'md', 'sm'] as const;
  const sizes = ['sm', 'md', 'lg'] as const;
</script>

<Story name="ImagePlaceholder" asChild>
  <div class="flex flex-wrap items-end gap-4">
    {#each ratios as ratio}
      <ImagePlaceholder {ratio} />
    {/each}
  </div>
</Story>

<Story name="TextSkeleton" asChild>
  <div class="grid gap-3">
    {#each widths as width}
      <TextSkeleton {width} />
    {/each}
  </div>
</Story>

<Story name="BlockPlaceholder" asChild>
  <div class="flex flex-wrap items-end gap-4">
    {#each sizes as size}
      <BlockPlaceholder {size} />
    {/each}
  </div>
</Story>
