<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  // 'full'은 고정 320px, 'stretch'는 부모 컨테이너 폭을 가득 채운다.
  type SkeletonWidth = 'stretch' | 'full' | 'lg' | 'md' | 'sm';

  type TextSkeletonProps = HTMLAttributes<HTMLDivElement> & {
    width?: SkeletonWidth;
  };

  let { width = 'full', class: className = '', ...rest }: TextSkeletonProps = $props();

  const widthClass: Record<SkeletonWidth, string> = {
    stretch: 'w-full',
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
