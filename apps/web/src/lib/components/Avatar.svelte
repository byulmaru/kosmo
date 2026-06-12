<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import { tv } from '$lib/tv';

  type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  type AvatarProps = HTMLAttributes<HTMLDivElement> & {
    size?: AvatarSize;
    src?: string;
    alt?: string;
    initials?: string;
    // Svelte의 ClassValue(숫자·딕셔너리 포함)는 tailwind-merge가 받지 못하므로
    // 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    size = 'md',
    src,
    alt = '',
    initials = '',
    class: className,
    ...rest
  }: AvatarProps = $props();

  const avatar = tv({
    base: 'border-border bg-surface text-text-secondary inline-grid shrink-0 place-items-center overflow-hidden rounded-full border font-bold',
    variants: {
      size: {
        xs: 'size-6 text-[10px]',
        sm: 'size-8 text-xs',
        md: 'size-10 text-sm',
        lg: 'size-12 text-base',
        xl: 'size-16 text-xl',
      },
    },
  });
</script>

<div {...rest} class={avatar({ size, class: className })}>
  {#if src}
    <img class="size-full object-cover" {src} {alt} />
  {:else if initials}
    <span>{initials}</span>
  {:else}
    <span aria-hidden="true">·</span>
  {/if}
</div>
