<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { fragment } from './Gallery.graphql';
  import GalleryItem from './GalleryItem.svelte';
  import type { Gallery_PostSnapshot_Fragment$key } from './__generated__/Gallery_PostSnapshot_Fragment.graphql';

  const { $snapshot: snapshotRef }: { $snapshot: Gallery_PostSnapshot_Fragment$key } = $props();

  const snapshot = useFragment(fragment, snapshotRef);
</script>

<div>
  {#if $snapshot.media?.length === 1}
    <GalleryItem class="w-full rounded-md" $file={$snapshot.media[0]} freeSize={true} />
  {:else if $snapshot.media?.length === 2}
    <div class="grid aspect-[2] grid-flow-row grid-cols-2 gap-1">
      <GalleryItem class="rounded-l-md" $file={$snapshot.media[0]} />
      <GalleryItem class="rounded-r-md" $file={$snapshot.media[1]} />
    </div>
  {:else if $snapshot.media?.length === 3}
    <div class="grid aspect-square grid-flow-row grid-cols-2 grid-rows-2 gap-1">
      <GalleryItem class="row-span-2 rounded-l-md" $file={$snapshot.media[0]} />
      <GalleryItem class="rounded-tr-md" $file={$snapshot.media[1]} />
      <GalleryItem class="rounded-br-md" $file={$snapshot.media[2]} />
    </div>
  {:else if $snapshot.media?.length === 4}
    <div class="grid aspect-square grid-flow-row grid-cols-2 grid-rows-2 gap-1">
      <GalleryItem class="rounded-tl-md" $file={$snapshot.media[0]} />
      <GalleryItem class="rounded-tr-md" $file={$snapshot.media[1]} />
      <GalleryItem class="rounded-bl-md" $file={$snapshot.media[2]} />
      <GalleryItem class="rounded-br-md" $file={$snapshot.media[3]} />
    </div>
  {/if}
</div>
