<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { base64 } from 'rfc4648';
  import { thumbHashToDataURL } from 'thumbhash';
  import { cn } from '../utils';
  import { itemFragment } from './Gallery.graphql';
  import type { GalleryItem_File_Fragment$key } from './__generated__/GalleryItem_File_Fragment.graphql';

  const {
    $file: fileRef,
    class: className,
    freeSize = false,
  }: {
    $file: GalleryItem_File_Fragment$key;
    class?: string;
    freeSize?: boolean;
  } = $props();

  const file = useFragment(itemFragment, fileRef);

  const aspectRatio = $derived(
    freeSize && $file.metadata
      ? Math.max($file.metadata.width / $file.metadata.height, 0.5)
      : undefined,
  );
</script>

<div
  style:aspect-ratio={aspectRatio}
  style:max-width={freeSize ? undefined : `${$file.metadata?.width}px`}
  class={cn('overflow-hidden', className)}
>
  <img
    style:background-image={$file.placeholder
      ? `url(${thumbHashToDataURL(base64.parse($file.placeholder))})`
      : undefined}
    class="size-full bg-cover bg-center object-cover"
    alt={$file.alt}
    loading="lazy"
    src={$file.thumbnailUrl}
  />
</div>
