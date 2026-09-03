<script lang="ts">
  import { tv } from 'tailwind-variants';
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import type { VariantProps } from 'tailwind-variants';
  import type { PathnameWithSearchOrHash } from '$app/types';

  const variants = tv({
    base: 'inline-flex items-center justify-center rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        outline: 'border-border bg-background text-foreground hover:bg-muted',
      },
      size: {
        default: 'h-8 px-2.5',
        sm: 'h-7 px-2.5 text-[0.8rem]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  });

  let {
    children,
    href,
    size = 'default',
    variant = 'default',
  }: {
    children: Snippet;
    href: PathnameWithSearchOrHash;
    size?: VariantProps<typeof variants>['size'];
    variant?: VariantProps<typeof variants>['variant'];
  } = $props();
</script>

<a class={variants({ variant, size })} href={resolve(href)}>
  {@render children()}
</a>
