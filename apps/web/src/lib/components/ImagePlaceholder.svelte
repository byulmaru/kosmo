<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type ImageRatio = '1:1' | '4:3' | '16:9';

  type ImagePlaceholderProps = HTMLAttributes<HTMLDivElement> & {
    ratio?: ImageRatio;
  };

  let { ratio = '1:1', class: className = '', ...rest }: ImagePlaceholderProps = $props();

  const ratioClass: Record<ImageRatio, string> = {
    '1:1': 'w-40 aspect-square',
    '4:3': 'w-[12.5rem] aspect-[4/3]',
    '16:9': 'w-60 aspect-video',
  };
</script>

<div
  {...rest}
  data-ratio={ratio}
  class={`border-border bg-surface text-text-secondary grid place-items-center rounded-[12px] border ${ratioClass[ratio]} ${className}`}
>
  <div class="grid place-items-center gap-1 text-xs">
    <span class="text-2xl leading-none">□</span>
    <span>{ratio}</span>
  </div>
</div>
