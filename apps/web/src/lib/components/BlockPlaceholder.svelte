<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type BlockSize = 'sm' | 'md' | 'lg';

  type BlockPlaceholderProps = HTMLAttributes<HTMLDivElement> & {
    size?: BlockSize;
  };

  let { size = 'md', class: className = '', ...rest }: BlockPlaceholderProps = $props();

  const sizeClass: Record<BlockSize, string> = {
    sm: 'h-20 w-[12.5rem]',
    md: 'h-[7.5rem] w-80',
    lg: 'h-[12.5rem] w-80',
  };
</script>

<div
  {...rest}
  data-size={size}
  class={`border-border bg-secondary text-muted-foreground grid place-items-center rounded-[12px] border text-xs ${sizeClass[size]} ${className}`}
>
  {size}
</div>
