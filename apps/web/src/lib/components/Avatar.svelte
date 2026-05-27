<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  type AvatarProps = HTMLAttributes<HTMLDivElement> & {
    size?: AvatarSize;
    src?: string;
    alt?: string;
    initials?: string;
  };

  let {
    size = 'md',
    src,
    alt = '',
    initials = '',
    class: className = '',
    ...rest
  }: AvatarProps = $props();

  const sizeClass: Record<AvatarSize, string> = {
    xs: 'size-6 text-[10px]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-12 text-base',
    xl: 'size-16 text-xl',
  };
</script>

<div
  {...rest}
  class={`border-border bg-secondary text-secondary-foreground inline-grid shrink-0 place-items-center overflow-hidden rounded-full border font-bold ${sizeClass[size]} ${className}`}
>
  {#if src}
    <img class="size-full object-cover" {src} {alt} />
  {:else if initials}
    <span>{initials}</span>
  {:else}
    <span aria-hidden="true">·</span>
  {/if}
</div>
