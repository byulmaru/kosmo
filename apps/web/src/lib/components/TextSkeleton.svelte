<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type SkeletonWidth = 'full' | 'lg' | 'md' | 'sm';

  type TextSkeletonProps = HTMLAttributes<HTMLDivElement> & {
    width?: SkeletonWidth;
  };

  let { width = 'full', class: className = '', ...rest }: TextSkeletonProps = $props();

  const widthClass: Record<SkeletonWidth, string> = {
    full: 'w-80',
    lg: 'w-60',
    md: 'w-40',
    sm: 'w-20',
  };
</script>

<div
  {...rest}
  data-width={width}
  class={`border-border bg-surface h-3 rounded-[4px] border ${widthClass[width]} ${className}`}
></div>
